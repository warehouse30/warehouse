from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.stock import Stock
from app.models.product import Product
from app.models.audit import AuditLog
from app.schemas.stock import StockAdjustment
from app.core.logging import get_logger
from app.services.notify import notify
import json

logger = get_logger(__name__)


async def resolve_product(db: AsyncSession, adj: StockAdjustment) -> Product:
    if adj.product_id:
        result = await db.execute(select(Product).where(Product.id == adj.product_id))
        product = result.scalar_one_or_none()
    elif adj.barcode:
        result = await db.execute(select(Product).where(Product.barcode == adj.barcode))
        product = result.scalar_one_or_none()
    elif adj.sku:
        result = await db.execute(select(Product).where(Product.sku == adj.sku))
        product = result.scalar_one_or_none()
    else:
        raise HTTPException(status_code=400, detail="Provide product_id, barcode or sku")
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


async def adjust_stock(
    db: AsyncSession,
    adj: StockAdjustment,
    user_id: int,
    ip: str | None = None,
) -> Stock:
    """
    Atomically adjust stock using SELECT ... FOR UPDATE (row-level lock).
    Prevents concurrent oversell / negative stock races.
    """
    product = await resolve_product(db, adj)

    # Row-level lock – critical for concurrency safety
    result = await db.execute(
        select(Stock)
        .where(
            Stock.warehouse_id == adj.warehouse_id,
            Stock.product_id == product.id,
        )
        .with_for_update()
    )
    stock = result.scalar_one_or_none()

    if stock is None:
        # Create stock row if first time
        stock = Stock(
            warehouse_id=adj.warehouse_id,
            product_id=product.id,
            quantity=Decimal("0"),
            reserved=Decimal("0"),
            version=1,
        )
        db.add(stock)
        await db.flush()
        # Re-lock after insert
        result = await db.execute(
            select(Stock).where(Stock.id == stock.id).with_for_update()
        )
        stock = result.scalar_one()

    # Optimistic version check (optional extra safety)
    if adj.expected_version is not None and stock.version != adj.expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stock version conflict. Expected {adj.expected_version}, got {stock.version}",
        )

    new_qty = Decimal(stock.quantity) + Decimal(adj.quantity_delta)
    if new_qty < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Current: {stock.quantity}, delta: {adj.quantity_delta}",
        )

    old_qty = stock.quantity
    stock.quantity = new_qty
    stock.version += 1

    # Audit trail
    audit = AuditLog(
        user_id=user_id,
        action="stock_adjust",
        entity_type="stock",
        entity_id=stock.id,
        details=json.dumps({
            "product_id": product.id,
            "sku": product.sku,
            "warehouse_id": adj.warehouse_id,
            "old_qty": float(old_qty),
            "delta": float(adj.quantity_delta),
            "new_qty": float(new_qty),
            "reason": adj.reason,
        }),
        ip_address=ip,
    )
    db.add(audit)

    await db.flush()

    # Low-stock notification
    try:
        min_s = float(product.min_stock or 0)
        if min_s > 0 and float(new_qty) <= min_s:
            await notify(
                db,
                title=f"Low stock: {product.sku}",
                body=f"{product.name}: qty {float(new_qty)} ≤ min {min_s} (warehouse {adj.warehouse_id})",
                level="warning",
                link="/stocks",
            )
    except Exception:
        pass

    logger.info(
        "stock_adjusted",
        user_id=user_id,
        product_id=product.id,
        warehouse_id=adj.warehouse_id,
        delta=float(adj.quantity_delta),
        new_qty=float(new_qty),
    )
    return stock


async def get_stock_detail(db: AsyncSession, stock_id: int) -> Stock | None:
    result = await db.execute(
        select(Stock)
        .options(selectinload(Stock.product), selectinload(Stock.warehouse))
        .where(Stock.id == stock_id)
    )
    return result.scalar_one_or_none()
