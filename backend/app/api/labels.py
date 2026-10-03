import io
from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape
from app.core.deps import DbSession, CurrentUser
from app.models.product import Product
from app.services.pricing_service import compute_sales_price

router = APIRouter()


@router.get("/product/{product_id}.pdf")
async def product_label_pdf(
    product_id: int,
    db: DbSession,
    user: CurrentUser,
    price_list_id: int | None = None,
    copies: int = 1,
):
    """80mm-wide thermal-style product label PDF."""
    r = await db.execute(
        select(Product).options(selectinload(Product.category)).where(Product.id == product_id)
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    price_txt = ""
    if price_list_id:
        priced = await compute_sales_price(db, p, price_list_id)
        price_txt = f"{priced['sales_price_incl_tax']:.2f}"

    copies = max(1, min(copies, 20))
    width, height = 80 * mm, 40 * mm
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    for _ in range(copies):
        c.setFont("Helvetica-Bold", 11)
        c.drawString(4 * mm, height - 8 * mm, (p.name or "")[:28])
        c.setFont("Helvetica", 9)
        c.drawString(4 * mm, height - 14 * mm, f"SKU: {p.sku}")
        if p.barcode:
            c.drawString(4 * mm, height - 19 * mm, f"BC: {p.barcode}")
        if price_txt:
            c.setFont("Helvetica-Bold", 14)
            c.drawString(4 * mm, 6 * mm, price_txt)
        c.showPage()
    c.save()
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="label-{p.sku}.pdf"'},
    )
