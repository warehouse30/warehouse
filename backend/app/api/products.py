from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate, CategoryCreate, CategoryOut
from app.schemas.common import PaginatedResponse

router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: DbSession, user: CurrentUser):
    result = await db.execute(select(Category).order_by(Category.name))
    return result.scalars().all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    data: CategoryCreate,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    cat = Category(**data.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.get("", response_model=PaginatedResponse[ProductOut])
async def list_products(
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    category_id: int | None = None,
):
    q = select(Product).options(selectinload(Product.category))
    count_q = select(func.count(Product.id))

    if search:
        term = f"%{search}%"
        filt = or_(Product.sku.ilike(term), Product.name.ilike(term), Product.barcode.ilike(term))
        q = q.where(filt)
        count_q = count_q.where(filt)
    if category_id:
        q = q.where(Product.category_id == category_id)
        count_q = count_q.where(Product.category_id == category_id)

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        q.order_by(Product.sku).offset((page - 1) * page_size).limit(page_size)
    )
    items = result.scalars().all()
    pages = (total + page_size - 1) // page_size if page_size else 0
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("", response_model=ProductOut, status_code=201)
async def create_product(
    data: ProductCreate,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(Product).where(Product.sku == data.sku))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="SKU already exists")
    product = Product(**data.model_dump())
    db.add(product)
    await db.flush()
    await db.refresh(product)
    return product


@router.get("/by-barcode/{barcode}", response_model=ProductOut)
async def get_by_barcode(barcode: str, db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(Product).options(selectinload(Product.category)).where(Product.barcode == barcode)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: int, db: DbSession, user: CurrentUser):
    result = await db.execute(
        select(Product).options(selectinload(Product.category)).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(
        select(Product).options(selectinload(Product.category)).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(product, k, v)
    await db.flush()
    await db.refresh(product)
    result = await db.execute(
        select(Product).options(selectinload(Product.category)).where(Product.id == product_id)
    )
    return result.scalar_one()
