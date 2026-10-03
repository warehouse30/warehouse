from fastapi import APIRouter, Query, Response
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from app.core.deps import DbSession, CurrentUser
from app.models.stock import Stock
from app.models.product import Product
from app.models.warehouse import Warehouse
from app.models.audit import AuditLog
import io
import csv

router = APIRouter()


@router.get("/inventory")
async def inventory_report(
    db: DbSession,
    user: CurrentUser,
    warehouse_id: int | None = None,
    category_id: int | None = None,
    low_stock_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    q = (
        select(Stock)
        .options(selectinload(Stock.product).selectinload(Product.category), selectinload(Stock.warehouse))
        .join(Product)
    )
    count_q = select(func.count(Stock.id)).join(Product)
    filters = []
    if warehouse_id:
        filters.append(Stock.warehouse_id == warehouse_id)
    if category_id:
        filters.append(Product.category_id == category_id)
    if low_stock_only:
        filters.append(Stock.quantity <= Product.min_stock)
    if filters:
        q = q.where(and_(*filters))
        count_q = count_q.where(and_(*filters))
    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        q.order_by(Warehouse.code, Product.sku).offset((page - 1) * page_size).limit(page_size)
    )
    stocks = result.scalars().all()
    items = []
    for s in stocks:
        items.append({
            "warehouse": s.warehouse.code if s.warehouse else None,
            "sku": s.product.sku if s.product else None,
            "name": s.product.name if s.product else None,
            "bin_location": s.product.bin_location if s.product else None,
            "category": s.product.category.name if s.product and s.product.category else None,
            "quantity": float(s.quantity),
            "reserved": float(s.reserved),
            "available": float(s.available),
            "min_stock": float(s.product.min_stock) if s.product else 0,
            "is_low": float(s.quantity) <= float(s.product.min_stock) if s.product else False,
        })
    pages = (total + page_size - 1) // page_size if page_size else 0
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.get("/alerts/low-stock")
async def low_stock_alerts(db: DbSession, user: CurrentUser, warehouse_id: int | None = None):
    q = (
        select(Stock)
        .options(selectinload(Stock.product), selectinload(Stock.warehouse))
        .join(Product)
        .where(Stock.quantity <= Product.min_stock)
    )
    if warehouse_id:
        q = q.where(Stock.warehouse_id == warehouse_id)
    result = await db.execute(q.order_by(Product.sku).limit(200))
    alerts = []
    for s in result.scalars().all():
        alerts.append({
            "warehouse": s.warehouse.code if s.warehouse else None,
            "sku": s.product.sku if s.product else None,
            "name": s.product.name if s.product else None,
            "quantity": float(s.quantity),
            "min_stock": float(s.product.min_stock) if s.product else 0,
            "deficit": float(s.product.min_stock) - float(s.quantity) if s.product else 0,
        })
    return {"count": len(alerts), "items": alerts}


@router.get("/export/inventory.csv")
async def export_inventory_csv(
    db: DbSession,
    user: CurrentUser,
    warehouse_id: int | None = None,
    low_stock_only: bool = False,
):
    q = (
        select(Stock)
        .options(selectinload(Stock.product), selectinload(Stock.warehouse))
        .join(Product)
    )
    if warehouse_id:
        q = q.where(Stock.warehouse_id == warehouse_id)
    if low_stock_only:
        q = q.where(Stock.quantity <= Product.min_stock)
    result = await db.execute(q.order_by(Product.sku))
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["warehouse", "sku", "name", "bin_location", "quantity", "min_stock", "is_low"])
    for s in result.scalars().all():
        is_low = float(s.quantity) <= float(s.product.min_stock) if s.product else False
        w.writerow([
            s.warehouse.code if s.warehouse else "",
            s.product.sku if s.product else "",
            s.product.name if s.product else "",
            s.product.bin_location if s.product else "",
            float(s.quantity),
            float(s.product.min_stock) if s.product else 0,
            is_low,
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory.csv"},
    )


@router.get("/audit")
async def audit_log(
    db: DbSession,
    user: CurrentUser,
    action: str | None = None,
    entity_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    from datetime import datetime, timezone
    q = select(AuditLog).options(selectinload(AuditLog.user))
    count_q = select(func.count(AuditLog.id))
    if action:
        q = q.where(AuditLog.action == action)
        count_q = count_q.where(AuditLog.action == action)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
        count_q = count_q.where(AuditLog.entity_type == entity_type)
    if date_from:
        try:
            df = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            q = q.where(AuditLog.created_at >= df)
            count_q = count_q.where(AuditLog.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
            q = q.where(AuditLog.created_at <= dt)
            count_q = count_q.where(AuditLog.created_at <= dt)
        except ValueError:
            pass
    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        q.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    logs = result.scalars().all()
    items = [
        {
            "id": l.id,
            "user": l.user.full_name if l.user else None,
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "details": l.details,
            "ip": l.ip_address,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]
    pages = (total + page_size - 1) // page_size if page_size else 0
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.get("/export/audit.csv")
async def export_audit_csv(
    db: DbSession,
    user: CurrentUser,
    action: str | None = None,
    entity_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    from datetime import datetime
    import csv
    import io
    from fastapi.responses import StreamingResponse
    q = select(AuditLog).options(selectinload(AuditLog.user))
    if action:
        q = q.where(AuditLog.action == action)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if date_from:
        try:
            q = q.where(AuditLog.created_at >= datetime.fromisoformat(date_from.replace("Z", "+00:00")))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.where(AuditLog.created_at <= datetime.fromisoformat(date_to.replace("Z", "+00:00")))
        except ValueError:
            pass
    logs = (await db.execute(q.order_by(AuditLog.created_at.desc()).limit(5000))).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "created_at", "user", "action", "entity_type", "entity_id", "details", "ip"])
    for l in logs:
        w.writerow([
            l.id,
            l.created_at.isoformat() if l.created_at else "",
            l.user.full_name if l.user else "",
            l.action,
            l.entity_type,
            l.entity_id or "",
            l.details or "",
            l.ip_address or "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit.csv"},
    )
