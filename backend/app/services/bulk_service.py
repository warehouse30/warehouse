import io
from typing import Optional
from decimal import Decimal
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
from app.models.product import Product
from app.models.warehouse import Warehouse
from app.models.stock import Stock
from app.models.category import Category
from app.core.logging import get_logger

logger = get_logger(__name__)

# In-memory job status for demo (use Redis in production)
_job_status: dict[str, dict] = {}


def get_job_status(job_id: str) -> Optional[dict]:
    return _job_status.get(job_id)


def set_job_status(job_id: str, **kwargs):
    if job_id not in _job_status:
        _job_status[job_id] = {"status": "pending", "progress": 0, "total": 0, "errors": []}
    _job_status[job_id].update(kwargs)


async def process_product_import(
    db: AsyncSession,
    file_bytes: bytes,
    filename: str,
    job_id: str,
    warehouse_id: Optional[int] = None,
):
    """Background task: import products + optional initial stock from Excel/CSV."""
    set_job_status(job_id, status="running", progress=0)
    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))

        # Normalize columns
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
        required = {"sku", "name"}
        if not required.issubset(set(df.columns)):
            set_job_status(job_id, status="failed", errors=["Missing required columns: sku, name"])
            return

        total = len(df)
        set_job_status(job_id, total=total)
        errors = []

        for idx, row in df.iterrows():
            try:
                sku = str(row["sku"]).strip()
                name = str(row["name"]).strip()
                barcode = str(row.get("barcode", "")).strip() or None
                unit = str(row.get("unit", "pcs")).strip() or "pcs"
                min_stock = Decimal(str(row.get("min_stock", 0) or 0))
                category_name = str(row.get("category", "")).strip() or None
                qty = Decimal(str(row.get("quantity", 0) or 0))

                # Category
                category_id = None
                if category_name:
                    r = await db.execute(select(Category).where(Category.name == category_name))
                    cat = r.scalar_one_or_none()
                    if not cat:
                        cat = Category(name=category_name)
                        db.add(cat)
                        await db.flush()
                    category_id = cat.id

                # Product upsert
                r = await db.execute(select(Product).where(Product.sku == sku))
                product = r.scalar_one_or_none()
                if product:
                    product.name = name
                    product.barcode = barcode or product.barcode
                    product.unit = unit
                    product.min_stock = min_stock
                    product.category_id = category_id or product.category_id
                else:
                    product = Product(
                        sku=sku,
                        barcode=barcode,
                        name=name,
                        unit=unit,
                        min_stock=min_stock,
                        category_id=category_id,
                    )
                    db.add(product)
                    await db.flush()

                # Initial stock if warehouse provided
                if warehouse_id and qty > 0:
                    r = await db.execute(
                        select(Stock).where(
                            Stock.warehouse_id == warehouse_id,
                            Stock.product_id == product.id,
                        )
                    )
                    stock = r.scalar_one_or_none()
                    if stock:
                        stock.quantity = qty
                        stock.version += 1
                    else:
                        db.add(Stock(
                            warehouse_id=warehouse_id,
                            product_id=product.id,
                            quantity=qty,
                        ))

                await db.commit()
            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")
                await db.rollback()

            set_job_status(job_id, progress=idx + 1, errors=errors[-20:])  # keep last 20 errors

        set_job_status(
            job_id,
            status="completed" if not errors else "completed_with_errors",
            progress=total,
            errors=errors,
        )
        logger.info("bulk_import_done", job_id=job_id, total=total, errors=len(errors))
    except Exception as e:
        set_job_status(job_id, status="failed", errors=[str(e)])
        logger.exception("bulk_import_failed", job_id=job_id)
