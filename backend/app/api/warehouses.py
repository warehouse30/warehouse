from fastapi import APIRouter, HTTPException, Depends, Query
from time import time
from collections import defaultdict
from sqlalchemy import select, func
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.warehouse import Warehouse
from app.models.stock import Stock
from app.schemas.warehouse import WarehouseCreate, WarehouseOut, WarehouseUpdate
from app.services.hikvision_service import test_connection, remote_open_door

router = APIRouter()
_gate_hits: dict[str, list[float]] = defaultdict(list)
_GATE_LIMIT = 10  # per minute per user+warehouse



def _out(wh: Warehouse) -> WarehouseOut:
    return WarehouseOut.model_validate(wh)


@router.get("", response_model=list[WarehouseOut])
async def list_warehouses(
    db: DbSession,
    user: CurrentUser,
    include_inactive: bool = Query(False),
):
    q = select(Warehouse).order_by(Warehouse.code)
    if not include_inactive:
        q = q.where(Warehouse.is_active == True)
    result = await db.execute(q)
    rows = list(result.scalars().all())
    allowed = user.allowed_warehouse_ids()
    if allowed is not None:
        rows = [w for w in rows if w.id in allowed]
    return [_out(w) for w in rows]


@router.get("/summary")
async def warehouses_summary(db: DbSession, user: CurrentUser):
    """List warehouses with stock SKU count and total quantity."""
    result = await db.execute(select(Warehouse).order_by(Warehouse.code))
    warehouses = list(result.scalars().all())
    allowed = user.allowed_warehouse_ids()
    if allowed is not None:
        warehouses = [w for w in warehouses if w.id in allowed]

    summaries = []
    for wh in warehouses:
        r = await db.execute(
            select(
                func.count(Stock.id),
                func.coalesce(func.sum(Stock.quantity), 0),
            ).where(Stock.warehouse_id == wh.id)
        )
        row = r.one()
        summaries.append({
            **_out(wh).model_dump(mode="json"),
            "sku_count": int(row[0] or 0),
            "total_qty": float(row[1] or 0),
        })
    return summaries


@router.post("", response_model=WarehouseOut, status_code=201)
async def create_warehouse(
    data: WarehouseCreate,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(Warehouse).where(Warehouse.code == data.code))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Warehouse code already exists")
    wh = Warehouse(**data.model_dump())
    db.add(wh)
    await db.flush()
    await db.refresh(wh)
    return _out(wh)


@router.get("/{warehouse_id}", response_model=WarehouseOut)
async def get_warehouse(warehouse_id: int, db: DbSession, user: CurrentUser):
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return _out(wh)


@router.patch("/{warehouse_id}", response_model=WarehouseOut)
async def update_warehouse(
    warehouse_id: int,
    data: WarehouseUpdate,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    payload = data.model_dump(exclude_unset=True)
    # Allow clearing password only when explicitly sent as empty string to mean "keep"
    if "gate_password" in payload and payload["gate_password"] in (None, ""):
        payload.pop("gate_password")
    for k, v in payload.items():
        setattr(wh, k, v)
    await db.flush()
    await db.refresh(wh)
    return _out(wh)


@router.post("/{warehouse_id}/deactivate", response_model=WarehouseOut)
async def deactivate_warehouse(
    warehouse_id: int,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    wh.is_active = False
    await db.flush()
    await db.refresh(wh)
    return _out(wh)


@router.post("/{warehouse_id}/activate", response_model=WarehouseOut)
async def activate_warehouse(
    warehouse_id: int,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    wh.is_active = True
    await db.flush()
    await db.refresh(wh)
    return _out(wh)


@router.post("/{warehouse_id}/gate/test")
async def gate_test(
    warehouse_id: int,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    try:
        return await test_connection(wh)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{warehouse_id}/gate/open")
async def gate_open(
    warehouse_id: int,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.GATE)),
):
    key = f"{user.id}:{warehouse_id}"
    now = time()
    _gate_hits[key] = [t for t in _gate_hits[key] if now - t < 60]
    if len(_gate_hits[key]) >= _GATE_LIMIT:
        raise HTTPException(429, "Gate open rate limit exceeded (10/min)")
    _gate_hits[key].append(now)
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    from app.models.audit import AuditLog
    db.add(AuditLog(
        user_id=user.id,
        action="gate.open",
        entity_type="warehouse",
        entity_id=warehouse_id,
        details=f"Remote open door on {wh.code}",
    ))
    return await remote_open_door(wh)
