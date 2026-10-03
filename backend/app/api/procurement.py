from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from decimal import Decimal
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.procurement import (
    PurchaseOrder, PurchaseOrderItem, GoodsReceipt, GoodsReceiptItem, POStatus,
)
from app.models.product import Product
from app.models.stock import Stock
from app.services.notify import notify
from app.services.stock_service import adjust_stock
from app.schemas.stock import StockAdjustment

router = APIRouter()


class POItemIn(BaseModel):
    product_id: int
    quantity_ordered: Decimal
    unit_cost: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")


class POIn(BaseModel):
    supplier_name: str
    warehouse_id: int
    notes: Optional[str] = None
    items: List[POItemIn] = Field(min_length=1)


class POOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: str
    supplier_name: str
    warehouse_id: int
    status: str
    notes: Optional[str] = None
    created_at: datetime
    items: list = []


def _po_out(po: PurchaseOrder) -> dict:
    return {
        "id": po.id,
        "number": po.number,
        "supplier_name": po.supplier_name,
        "warehouse_id": po.warehouse_id,
        "status": po.status.value if po.status else "draft",
        "notes": po.notes,
        "created_at": po.created_at,
        "items": [
            {
                "id": it.id,
                "product_id": it.product_id,
                "sku": it.product.sku if it.product else None,
                "name": it.product.name if it.product else None,
                "quantity_ordered": float(it.quantity_ordered),
                "quantity_received": float(it.quantity_received or 0),
                "unit_cost": float(it.unit_cost or 0),
                "tax_rate": float(it.tax_rate or 0),
            }
            for it in po.items
        ],
    }


async def _load_po(db, pid: int) -> PurchaseOrder | None:
    r = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product))
        .where(PurchaseOrder.id == pid)
    )
    return r.scalar_one_or_none()


@router.get("/orders")
async def list_pos(db: DbSession, user: CurrentUser, limit: int = 50):
    r = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product))
        .order_by(desc(PurchaseOrder.id))
        .limit(limit)
    )
    return [_po_out(p) for p in r.scalars().all()]


@router.post("/orders", status_code=201)
async def create_po(data: POIn, db: DbSession, user: CurrentUser):
    last = (await db.execute(select(PurchaseOrder).order_by(desc(PurchaseOrder.id)).limit(1))).scalar_one_or_none()
    seq = (last.id + 1) if last else 1
    number = f"PO-{datetime.now().strftime('%Y%m%d')}-{seq:04d}"
    po = PurchaseOrder(
        number=number,
        supplier_name=data.supplier_name,
        warehouse_id=data.warehouse_id,
        notes=data.notes,
        status=POStatus.ORDERED,
        created_by=user.id,
    )
    db.add(po)
    await db.flush()
    for it in data.items:
        db.add(PurchaseOrderItem(
            purchase_order_id=po.id,
            product_id=it.product_id,
            quantity_ordered=it.quantity_ordered,
            unit_cost=it.unit_cost,
            tax_rate=it.tax_rate,
        ))
        # update product purchase price if provided
        if float(it.unit_cost) > 0:
            pr = await db.execute(select(Product).where(Product.id == it.product_id))
            prod = pr.scalar_one_or_none()
            if prod:
                prod.purchase_price = it.unit_cost
    await db.flush()
    await notify(db, f"PO {number} created", f"Supplier: {data.supplier_name}", "info", f"/procurement")
    po = await _load_po(db, po.id)
    return _po_out(po)


class GRItemIn(BaseModel):
    product_id: int
    quantity: Decimal
    unit_cost: Optional[Decimal] = None


class GRIn(BaseModel):
    purchase_order_id: int
    notes: Optional[str] = None
    items: List[GRItemIn] = Field(min_length=1)


@router.post("/receipts", status_code=201)
async def create_receipt(data: GRIn, db: DbSession, user: CurrentUser):
    po = await _load_po(db, data.purchase_order_id)
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status == POStatus.CANCELLED:
        raise HTTPException(400, "PO cancelled")

    last = (await db.execute(select(GoodsReceipt).order_by(desc(GoodsReceipt.id)).limit(1))).scalar_one_or_none()
    seq = (last.id + 1) if last else 1
    number = f"GR-{datetime.now().strftime('%Y%m%d')}-{seq:04d}"
    gr = GoodsReceipt(
        number=number,
        purchase_order_id=po.id,
        warehouse_id=po.warehouse_id,
        notes=data.notes,
        created_by=user.id,
    )
    db.add(gr)
    await db.flush()

    for it in data.items:
        qty = float(it.quantity)
        if qty <= 0:
            continue
        cost = float(it.unit_cost) if it.unit_cost is not None else None
        # lock stock row
        r = await db.execute(
            select(Stock)
            .where(Stock.product_id == it.product_id, Stock.warehouse_id == po.warehouse_id)
            .with_for_update()
        )
        stock = r.scalar_one_or_none()
        if not stock:
            stock = Stock(product_id=it.product_id, warehouse_id=po.warehouse_id, quantity=0, reserved=0)
            db.add(stock)
            await db.flush()
            r = await db.execute(
                select(Stock)
                .where(Stock.product_id == it.product_id, Stock.warehouse_id == po.warehouse_id)
                .with_for_update()
            )
            stock = r.scalar_one()
        stock.quantity = float(stock.quantity or 0) + qty

        # PO line received
        po_item = next((x for x in po.items if x.product_id == it.product_id), None)
        if po_item:
            po_item.quantity_received = float(po_item.quantity_received or 0) + qty
            if cost is None:
                cost = float(po_item.unit_cost or 0)
            if cost and cost > 0:
                prod = (await db.execute(select(Product).where(Product.id == it.product_id))).scalar_one_or_none()
                if prod:
                    prod.purchase_price = cost

        db.add(GoodsReceiptItem(
            receipt_id=gr.id,
            product_id=it.product_id,
            quantity=qty,
            unit_cost=cost or 0,
        ))

    # update PO status
    all_recv = all(
        float(x.quantity_received or 0) >= float(x.quantity_ordered or 0) for x in po.items
    )
    any_recv = any(float(x.quantity_received or 0) > 0 for x in po.items)
    if all_recv:
        po.status = POStatus.RECEIVED
    elif any_recv:
        po.status = POStatus.PARTIAL

    await notify(
        db,
        f"Goods receipt {number}",
        f"PO {po.number} — stock increased",
        "info",
        "/procurement",
    )
    await db.flush()
    return {"id": gr.id, "number": number, "po_status": po.status.value}


@router.get("/receipts")
async def list_receipts(db: DbSession, user: CurrentUser, limit: int = 50):
    r = await db.execute(
        select(GoodsReceipt).order_by(desc(GoodsReceipt.id)).limit(limit)
    )
    return [
        {
            "id": g.id,
            "number": g.number,
            "purchase_order_id": g.purchase_order_id,
            "warehouse_id": g.warehouse_id,
            "created_at": g.created_at,
        }
        for g in r.scalars().all()
    ]
