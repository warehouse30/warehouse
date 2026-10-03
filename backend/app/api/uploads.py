import os
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DbSession, require_roles
from app.models.user import UserRole
from app.models.product import Product

router = APIRouter()

UPLOAD_ROOT = Path(os.environ.get("UPLOAD_DIR", str(Path(__file__).resolve().parents[2] / "uploads")))
PRODUCT_DIR = UPLOAD_ROOT / "products"
PRODUCT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@router.post("/products/{product_id}/image")
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: DbSession = None,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    r = await db.execute(select(Product).where(Product.id == product_id))
    product = r.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(400, f"Allowed types: {', '.join(ALLOWED)}")
    name = f"{product_id}_{uuid.uuid4().hex[:12]}{ext}"
    dest = PRODUCT_DIR / name
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "Max file size 8MB")
    dest.write_bytes(content)
    # Public path served by static mount
    url = f"/uploads/products/{name}"
    product.photo_url = url
    await db.flush()
    return {"photo_url": url, "product_id": product_id}
