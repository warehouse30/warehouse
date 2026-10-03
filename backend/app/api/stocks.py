from fastapi import APIRouter, HTTPException, Query, Request, Header
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from decimal import Decimal
from app.core.deps import DbSession, CurrentUser
from app.models.stock import Stock
from app.models.product import Product
from app.models.idempotency import IdempotencyKey
from app.schemas.stock import StockAdjustment, StockOut
from app.schemas.common import PaginatedResponse
from app.services.stock_service import adjust_stock
import json

router = APIRouter()


def _stock_to_out(s: Stock) -> StockOut:
    return StockOut(
        id=s.id,
        warehouse_id=s.warehouse_id,
        product_id=s.product_id,
        quantity=s.quantity,
        reserved=s.reserved,
        available=s.available,
        version=s.version,
        updated_at=s.updated_at,
        product_sku=s.product.sku if s.product else None,
        product_name=s.product.name if s.product else None,
        product_barcode=s.product.barcode if s.product else None,
        warehouse_code=s.warehouse.code if s.warehouse else None,
    )


@router.get("", response_model=PaginatedResponse[StockOut])
async def list_stocks(
    db: DbSession,
    user: CurrentUser,
    warehouse_id: int | None = None,
    category_id: int | None = None,
    search: str | None = None,
    low_stock_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    allowed = user.allowed_warehouse_ids()
    q = (
        select(Stock)
        .options(selectinload(Stock.product), selectinload(Stock.warehouse))
        .join(Product)
    )
    count_q = select(func.count(Stock.id)).join(Product)

    if allowed is not None:
        q = q.where(Stock.warehouse_id.in_(allowed))
        count_q = count_q.where(Stock.warehouse_id.in_(allowed))
    if warehouse_id:
        q = q.where(Stock.warehouse_id == warehouse_id)
        count_q = count_q.where(Stock.warehouse_id == warehouse_id)
    if category_id:
        q = q.where(Product.category_id == category_id)
        count_q = count_q.where(Product.category_id == category_id)
    if search:
        term = f"%{search}%"
        filt = or_(Product.sku.ilike(term), Product.name.ilike(term), Product.barcode.ilike(term))
        q = q.where(filt)
        count_q = count_q.where(filt)
    if low_stock_only:
        q = q.where(Stock.quantity <= Product.min_stock)
        count_q = count_q.where(Stock.quantity <= Product.min_stock)

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        q.order_by(Product.sku).offset((page - 1) * page_size).limit(page_size)
    )
    stocks = result.scalars().all()
    pages = (total + page_size - 1) // page_size if page_size else 0
    return PaginatedResponse(
        items=[_stock_to_out(s) for s in stocks],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/adjust", response_model=StockOut)
async def adjust(
    data: StockAdjustment,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    x_idempotency_key: str | None = Header(None, alias="X-Idempotency-Key"),
):
    """Atomic stock adjustment. Optional X-Idempotency-Key prevents duplicate offline scans."""
    if x_idempotency_key:
        r = await db.execute(select(IdempotencyKey).where(IdempotencyKey.key == x_idempotency_key))
        existing = r.scalar_one_or_none()
        if existing and existing.response_json:
            cached = json.loads(existing.response_json)
            # Return cached shape – client already got this result
            result = await db.execute(
                select(Stock)
                .options(selectinload(Stock.product), selectinload(Stock.warehouse))
                .where(Stock.id == cached.get("id"))
            )
            stock = result.scalar_one_or_none()
            if stock:
                return _stock_to_out(stock)

    allowed = user.allowed_warehouse_ids()
    if allowed is not None and data.warehouse_id not in allowed:
        raise HTTPException(status_code=403, detail="Warehouse not allowed for this user")

    ip = request.client.host if request.client else None
    stock = await adjust_stock(db, data, user_id=user.id, ip=ip)
    result = await db.execute(
        select(Stock)
        .options(selectinload(Stock.product), selectinload(Stock.warehouse))
        .where(Stock.id == stock.id)
    )
    stock = result.scalar_one()
    out = _stock_to_out(stock)

    if x_idempotency_key:
        db.add(IdempotencyKey(
            key=x_idempotency_key,
            user_id=user.id,
            action="stock_adjust",
            response_json=out.model_dump_json(),
        ))
        await db.flush()

    return out


@router.post("/transfer")
async def transfer_stock(
    db: DbSession,
    user: CurrentUser,
    product_id: int | None = None,
    barcode: str | None = None,
    sku: str | None = None,
    from_warehouse_id: int = Query(...),
    to_warehouse_id: int = Query(...),
    quantity: Decimal = Query(..., gt=0),
):
    """Move stock between warehouses with dual row locks (ordered by warehouse_id)."""
    if from_warehouse_id == to_warehouse_id:
        raise HTTPException(status_code=400, detail="Warehouses must differ")
    # Always lock lower id first to avoid deadlock
    first, second = sorted([from_warehouse_id, to_warehouse_id])
    adj_out = StockAdjustment(
        product_id=product_id, barcode=barcode, sku=sku,
        quantity_delta=-quantity, warehouse_id=from_warehouse_id, reason="transfer_out",
    )
    adj_in = StockAdjustment(
        product_id=product_id, barcode=barcode, sku=sku,
        quantity_delta=quantity, warehouse_id=to_warehouse_id, reason="transfer_in",
    )
    # Process in consistent lock order
    if first == from_warehouse_id:
        await adjust_stock(db, adj_out, user.id)
        s_in = await adjust_stock(db, adj_in, user.id)
    else:
        s_in = await adjust_stock(db, adj_in, user.id)
        await adjust_stock(db, adj_out, user.id)
    return {"ok": True, "to_stock_id": s_in.id, "quantity": float(quantity)}
