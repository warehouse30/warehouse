from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from fastapi import HTTPException
from app.models.slip import Slip, SlipItem, SlipType, SlipStatus
from app.models.product import Product
from app.models.stock import Stock
from app.schemas.slip import SlipCreate
from app.services.qr_service import get_qr_for_slip
from app.services.stock_service import adjust_stock
from app.schemas.stock import StockAdjustment
from app.models.audit import AuditLog
from app.core.logging import get_logger
import json

logger = get_logger(__name__)


async def _next_slip_number(db: AsyncSession, prefix: str = "GP") -> str:
    result = await db.execute(select(Slip).order_by(Slip.id.desc()).limit(1))
    last = result.scalar_one_or_none()
    seq = (last.id + 1) if last else 1
    return f"{prefix}-{datetime.now().strftime('%Y%m%d')}-{seq:05d}"


async def _lock_stock(db: AsyncSession, product_id: int, warehouse_id: int) -> Stock:
    r = await db.execute(
        select(Stock)
        .where(Stock.product_id == product_id, Stock.warehouse_id == warehouse_id)
        .with_for_update()
    )
    stock = r.scalar_one_or_none()
    if not stock:
        stock = Stock(product_id=product_id, warehouse_id=warehouse_id, quantity=0, reserved=0)
        db.add(stock)
        await db.flush()
        r = await db.execute(
            select(Stock)
            .where(Stock.product_id == product_id, Stock.warehouse_id == warehouse_id)
            .with_for_update()
        )
        stock = r.scalar_one()
    return stock


async def reserve_stock(db: AsyncSession, product_id: int, warehouse_id: int, qty: float) -> None:
    stock = await _lock_stock(db, product_id, warehouse_id)
    avail = float(stock.quantity or 0) - float(stock.reserved or 0)
    if avail < qty:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient available stock (product {product_id}): need {qty}, available {avail}",
        )
    stock.reserved = float(stock.reserved or 0) + qty


async def release_reservation(db: AsyncSession, product_id: int, warehouse_id: int, qty: float) -> None:
    stock = await _lock_stock(db, product_id, warehouse_id)
    stock.reserved = max(0.0, float(stock.reserved or 0) - qty)


async def create_slip(
    db: AsyncSession,
    data: SlipCreate,
    user_id: int,
    reserve: bool = False,
) -> Slip:
    slip_number = await _next_slip_number(db, "GP" if data.slip_type == SlipType.OUT else "IN")

    slip = Slip(
        slip_number=slip_number,
        slip_type=data.slip_type,
        status=SlipStatus.DRAFT,
        warehouse_id=data.warehouse_id,
        created_by=user_id,
        customer_name=data.customer_name,
        vehicle_number=data.vehicle_number,
        notes=data.notes,
    )
    db.add(slip)
    await db.flush()

    for item in data.items:
        product = None
        if item.product_id:
            r = await db.execute(select(Product).where(Product.id == item.product_id))
            product = r.scalar_one_or_none()
        elif item.barcode:
            r = await db.execute(select(Product).where(Product.barcode == item.barcode))
            product = r.scalar_one_or_none()
        elif item.sku:
            r = await db.execute(select(Product).where(Product.sku == item.sku))
            product = r.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product not found for item {item}")

        db.add(SlipItem(
            slip_id=slip.id,
            product_id=product.id,
            quantity=item.quantity,
            notes=item.notes,
        ))
        if reserve and data.slip_type == SlipType.OUT:
            await reserve_stock(db, product.id, data.warehouse_id, float(item.quantity))

    payload, img_b64 = await get_qr_for_slip(
        slip_number,
        data.warehouse_id,
        {"type": data.slip_type.value, "customer": data.customer_name},
    )
    slip.qr_payload = payload
    slip.qr_image_b64 = img_b64

    db.add(AuditLog(
        user_id=user_id,
        action="slip_create",
        entity_type="slip",
        entity_id=slip.id,
        details=json.dumps({"slip_number": slip_number, "reserve": reserve}),
    ))
    await db.flush()
    return slip


async def confirm_slip(db: AsyncSession, slip_id: int, user_id: int) -> Slip:
    result = await db.execute(
        select(Slip)
        .options(selectinload(Slip.items))
        .where(Slip.id == slip_id)
        .with_for_update()
    )
    slip = result.scalar_one_or_none()
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    if slip.status not in (SlipStatus.DRAFT, SlipStatus.PRINTED):
        raise HTTPException(status_code=400, detail=f"Cannot confirm slip in status {slip.status}")

    for item in slip.items:
        qty = float(item.quantity)
        if slip.slip_type == SlipType.OUT:
            # Consume reservation if any, then reduce on-hand
            stock = await _lock_stock(db, item.product_id, slip.warehouse_id)
            reserved = float(stock.reserved or 0)
            release = min(reserved, qty)
            stock.reserved = reserved - release
            on_hand = float(stock.quantity or 0)
            if on_hand < qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient on-hand stock for product {item.product_id}: need {qty}, have {on_hand}",
                )
            stock.quantity = on_hand - qty
            stock.version = (stock.version or 0) + 1
            db.add(AuditLog(
                user_id=user_id,
                action="stock_adjust",
                entity_type="stock",
                entity_id=stock.id,
                details=json.dumps({
                    "product_id": item.product_id,
                    "warehouse_id": slip.warehouse_id,
                    "old_qty": on_hand,
                    "delta": -qty,
                    "new_qty": on_hand - qty,
                    "reason": f"slip_out:{slip.slip_number}",
                }),
            ))
        else:
            # IN, TRANSFER, ADJUST — use the central adjust_stock service
            await adjust_stock(
                db,
                StockAdjustment(
                    product_id=item.product_id,
                    quantity_delta=Decimal(str(qty)),
                    warehouse_id=slip.warehouse_id,
                    reason=f"slip:{slip.slip_number}",
                ),
                user_id=user_id,
            )

    slip.status = SlipStatus.CONFIRMED
    slip.confirmed_at = datetime.now(timezone.utc)

    db.add(AuditLog(
        user_id=user_id,
        action="slip_confirm",
        entity_type="slip",
        entity_id=slip.id,
        details=json.dumps({"slip_number": slip.slip_number, "type": slip.slip_type.value}),
    ))
    await db.flush()
    return slip


async def cancel_slip(db: AsyncSession, slip_id: int, user_id: int) -> Slip:
    result = await db.execute(
        select(Slip)
        .options(selectinload(Slip.items))
        .where(Slip.id == slip_id)
        .with_for_update()
    )
    slip = result.scalar_one_or_none()
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    if slip.status not in (SlipStatus.DRAFT, SlipStatus.PRINTED):
        raise HTTPException(status_code=400, detail=f"Cannot cancel slip in status {slip.status}")

    # Release any reservations (OUT drafts created from proposals)
    if slip.slip_type == SlipType.OUT:
        for item in slip.items:
            await release_reservation(db, item.product_id, slip.warehouse_id, float(item.quantity))

    slip.status = SlipStatus.CANCELLED
    db.add(AuditLog(
        user_id=user_id,
        action="slip_cancel",
        entity_type="slip",
        entity_id=slip.id,
        details=json.dumps({"slip_number": slip.slip_number}),
    ))
    await db.flush()
    return slip
