from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.cycle_count import CycleCount, CycleCountLine, CycleCountStatus
from app.models.stock import Stock
from app.models.product import Product
from app.services.stock_service import adjust_stock
from app.schemas.stock import StockAdjustment
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()


class CycleCountCreate(BaseModel):
    name: str
    warehouse_id: int
    notes: Optional[str] = None
    product_ids: Optional[List[int]] = None  # if empty, all products with stock


class CountLineSubmit(BaseModel):
    product_id: int
    counted_qty: Decimal


@router.post("")
async def create_cycle_count(data: CycleCountCreate, db: DbSession, user: CurrentUser):
    cc = CycleCount(
        name=data.name,
        warehouse_id=data.warehouse_id,
        created_by=user.id,
        notes=data.notes,
        status=CycleCountStatus.OPEN,
    )
    db.add(cc)
    await db.flush()

    # Snapshot stock lines
    q = select(Stock).where(Stock.warehouse_id == data.warehouse_id)
    if data.product_ids:
        q = q.where(Stock.product_id.in_(data.product_ids))
    result = await db.execute(q)
    stocks = result.scalars().all()
    for s in stocks:
        db.add(CycleCountLine(
            cycle_count_id=cc.id,
            product_id=s.product_id,
            system_qty=s.quantity,
        ))
    await db.flush()
    return {"id": cc.id, "name": cc.name, "lines": len(stocks), "status": cc.status.value}


@router.get("")
async def list_cycle_counts(db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(CycleCount).order_by(CycleCount.id.desc()).limit(50)
    )
    return [
        {
            "id": c.id,
            "name": c.name,
            "warehouse_id": c.warehouse_id,
            "status": c.status.value,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in result.scalars().all()
    ]


@router.get("/{cc_id}")
async def get_cycle_count(cc_id: int, db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(CycleCount)
        .options(selectinload(CycleCount.lines).selectinload(CycleCountLine.product))
        .where(CycleCount.id == cc_id)
    )
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status_code=404, detail="Not found")
    lines = []
    for ln in cc.lines:
        lines.append({
            "id": ln.id,
            "product_id": ln.product_id,
            "sku": ln.product.sku if ln.product else None,
            "name": ln.product.name if ln.product else None,
            "barcode": ln.product.barcode if ln.product else None,
            "bin_location": ln.product.bin_location if ln.product else None,
            "system_qty": float(ln.system_qty),
            "counted_qty": float(ln.counted_qty) if ln.counted_qty is not None else None,
            "variance": float(ln.variance) if ln.variance is not None else None,
        })
    return {
        "id": cc.id,
        "name": cc.name,
        "warehouse_id": cc.warehouse_id,
        "status": cc.status.value,
        "lines": lines,
    }


@router.post("/{cc_id}/count")
async def submit_count(cc_id: int, data: CountLineSubmit, db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(CycleCountLine).where(
            CycleCountLine.cycle_count_id == cc_id,
            CycleCountLine.product_id == data.product_id,
        )
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    line.counted_qty = data.counted_qty
    line.variance = Decimal(data.counted_qty) - Decimal(line.system_qty)
    line.counted_by = user.id
    line.counted_at = datetime.now(timezone.utc)
    await db.flush()
    return {
        "product_id": line.product_id,
        "counted_qty": float(line.counted_qty),
        "system_qty": float(line.system_qty),
        "variance": float(line.variance),
    }


@router.post("/{cc_id}/complete")
async def complete_cycle_count(
    cc_id: int,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    apply_adjustments: bool = True,
):
    result = await db.execute(
        select(CycleCount)
        .options(selectinload(CycleCount.lines))
        .where(CycleCount.id == cc_id)
    )
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status_code=404, detail="Not found")
    if cc.status != CycleCountStatus.OPEN:
        raise HTTPException(status_code=400, detail="Already closed")

    adjusted = 0
    if apply_adjustments:
        for ln in cc.lines:
            if ln.counted_qty is None:
                continue
            delta = Decimal(ln.counted_qty) - Decimal(ln.system_qty)
            if delta == 0:
                continue
            await adjust_stock(
                db,
                StockAdjustment(
                    product_id=ln.product_id,
                    quantity_delta=delta,
                    warehouse_id=cc.warehouse_id,
                    reason=f"cycle_count:{cc.id}",
                ),
                user_id=user.id,
            )
            adjusted += 1

    cc.status = CycleCountStatus.COMPLETED
    cc.completed_at = datetime.now(timezone.utc)
    await db.flush()
    return {"ok": True, "adjusted_lines": adjusted, "status": cc.status.value}
