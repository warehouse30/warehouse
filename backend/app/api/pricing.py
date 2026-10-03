from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, ConfigDict
from typing import Optional
from decimal import Decimal
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.pricing import TaxRate, PriceList, CategoryPriceFormula, FormulaTemplate
from app.models.product import Product
from app.services.pricing_service import compute_sales_price, evaluate_formula, get_purchase_breakdown, calc_tax

router = APIRouter()


# ---- Tax rates ----
class TaxIn(BaseModel):
    code: str
    name: str
    rate: Decimal
    is_active: bool = True


class TaxOut(TaxIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


@router.get("/taxes", response_model=list[TaxOut])
async def list_taxes(db: DbSession, user: CurrentUser, active_only: bool = True):
    q = select(TaxRate).order_by(TaxRate.rate)
    if active_only:
        q = q.where(TaxRate.is_active == True)
    return (await db.execute(q)).scalars().all()


@router.post("/taxes", response_model=TaxOut, status_code=201)
async def create_tax(data: TaxIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    t = TaxRate(**data.model_dump())
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return t


@router.patch("/taxes/{tax_id}", response_model=TaxOut)
async def update_tax(tax_id: int, data: TaxIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    r = await db.execute(select(TaxRate).where(TaxRate.id == tax_id))
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tax not found")
    for k, v in data.model_dump().items():
        setattr(t, k, v)
    await db.flush()
    return t


# ---- Price lists ----
class PriceListIn(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    is_default: bool = False
    is_active: bool = True
    sort_order: int = 0


class PriceListOut(PriceListIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


@router.get("/price-lists", response_model=list[PriceListOut])
async def list_price_lists(db: DbSession, user: CurrentUser):
    r = await db.execute(select(PriceList).order_by(PriceList.sort_order, PriceList.name))
    return r.scalars().all()


@router.post("/price-lists", response_model=PriceListOut, status_code=201)
async def create_price_list(data: PriceListIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    if data.is_default:
        existing = (await db.execute(select(PriceList).where(PriceList.is_default == True))).scalars().all()
        for e in existing:
            e.is_default = False
    pl = PriceList(**data.model_dump())
    db.add(pl)
    await db.flush()
    await db.refresh(pl)
    return pl


@router.patch("/price-lists/{pl_id}", response_model=PriceListOut)
async def update_price_list(pl_id: int, data: PriceListIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    r = await db.execute(select(PriceList).where(PriceList.id == pl_id))
    pl = r.scalar_one_or_none()
    if not pl:
        raise HTTPException(404, "Not found")
    if data.is_default:
        for e in (await db.execute(select(PriceList).where(PriceList.is_default == True))).scalars().all():
            e.is_default = False
    for k, v in data.model_dump().items():
        setattr(pl, k, v)
    await db.flush()
    return pl



# ---- Formula templates ----
class FormulaTemplateIn(BaseModel):
    code: str
    name: str
    formula: str = "purchase * 1.25"
    description: Optional[str] = None
    default_sales_tax_id: Optional[int] = None
    is_active: bool = True


class FormulaTemplateOut(FormulaTemplateIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    default_sales_tax_rate: Optional[float] = None


@router.get("/formula-templates", response_model=list[FormulaTemplateOut])
async def list_formula_templates(db: DbSession, user: CurrentUser):
    rows = (await db.execute(
        select(FormulaTemplate).options(selectinload(FormulaTemplate.default_sales_tax)).order_by(FormulaTemplate.name)
    )).scalars().all()
    return [
        FormulaTemplateOut(
            id=r.id, code=r.code, name=r.name, formula=r.formula,
            description=r.description, default_sales_tax_id=r.default_sales_tax_id,
            is_active=r.is_active,
            default_sales_tax_rate=float(r.default_sales_tax.rate) if r.default_sales_tax else None,
        )
        for r in rows
    ]


@router.post("/formula-templates", response_model=FormulaTemplateOut, status_code=201)
async def create_formula_template(data: FormulaTemplateIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    try:
        evaluate_formula(data.formula, 100.0)
    except Exception as e:
        raise HTTPException(400, f"Invalid formula: {e}")
    dup = (await db.execute(select(FormulaTemplate).where(FormulaTemplate.code == data.code))).scalar_one_or_none()
    if dup:
        raise HTTPException(400, f"Template code already exists: {data.code}")
    payload = data.model_dump()
    if not payload.get("default_sales_tax_id"):
        payload["default_sales_tax_id"] = None
    ft = FormulaTemplate(**payload)
    db.add(ft)
    await db.flush()
    r = await db.execute(select(FormulaTemplate).options(selectinload(FormulaTemplate.default_sales_tax)).where(FormulaTemplate.id == ft.id))
    ft = r.scalar_one()
    return FormulaTemplateOut(
        id=ft.id, code=ft.code, name=ft.name, formula=ft.formula,
        description=ft.description, default_sales_tax_id=ft.default_sales_tax_id,
        is_active=ft.is_active,
        default_sales_tax_rate=float(ft.default_sales_tax.rate) if ft.default_sales_tax else None,
    )


@router.patch("/formula-templates/{tid}", response_model=FormulaTemplateOut)
async def update_formula_template(tid: int, data: FormulaTemplateIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    try:
        evaluate_formula(data.formula, 100.0)
    except Exception as e:
        raise HTTPException(400, f"Invalid formula: {e}")
    r = await db.execute(select(FormulaTemplate).where(FormulaTemplate.id == tid))
    ft = r.scalar_one_or_none()
    if not ft:
        raise HTTPException(404, "Not found")
    payload = data.model_dump()
    if not payload.get("default_sales_tax_id"):
        payload["default_sales_tax_id"] = None
    for k, v in payload.items():
        setattr(ft, k, v)
    await db.flush()
    r = await db.execute(select(FormulaTemplate).options(selectinload(FormulaTemplate.default_sales_tax)).where(FormulaTemplate.id == tid))
    ft = r.scalar_one()
    return FormulaTemplateOut(
        id=ft.id, code=ft.code, name=ft.name, formula=ft.formula,
        description=ft.description, default_sales_tax_id=ft.default_sales_tax_id,
        is_active=ft.is_active,
        default_sales_tax_rate=float(ft.default_sales_tax.rate) if ft.default_sales_tax else None,
    )


@router.delete("/formula-templates/{tid}")
async def delete_formula_template(tid: int, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    r = await db.execute(select(FormulaTemplate).where(FormulaTemplate.id == tid))
    ft = r.scalar_one_or_none()
    if not ft:
        raise HTTPException(404, "Not found")
    await db.delete(ft)
    return {"ok": True}


class ApplyTemplateIn(BaseModel):
    template_id: int
    category_ids: list[int]
    price_list_ids: list[int]
    overwrite: bool = True


@router.post("/formula-templates/apply")
async def apply_formula_template(data: ApplyTemplateIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    """Apply a formula template to all category × price-list combinations."""
    if not data.template_id:
        raise HTTPException(400, "template_id is required")
    if not data.category_ids:
        raise HTTPException(400, "Select at least one category")
    if not data.price_list_ids:
        raise HTTPException(400, "Select at least one price list")

    r = await db.execute(select(FormulaTemplate).where(FormulaTemplate.id == data.template_id))
    ft = r.scalar_one_or_none()
    if not ft:
        raise HTTPException(404, "Template not found")

    # Validate formula still parses
    try:
        evaluate_formula(ft.formula, 100.0)
    except Exception as e:
        raise HTTPException(400, f"Template formula is invalid: {e}")

    created, updated, skipped = 0, 0, 0
    for cat_id in data.category_ids:
        for pl_id in data.price_list_ids:
            if not cat_id or not pl_id:
                skipped += 1
                continue
            existing = (await db.execute(
                select(CategoryPriceFormula).where(
                    CategoryPriceFormula.category_id == cat_id,
                    CategoryPriceFormula.price_list_id == pl_id,
                )
            )).scalar_one_or_none()
            if existing:
                if data.overwrite:
                    existing.formula = ft.formula
                    existing.sales_tax_id = ft.default_sales_tax_id
                    existing.formula_template_id = ft.id
                    existing.is_active = True
                    updated += 1
                else:
                    skipped += 1
            else:
                db.add(CategoryPriceFormula(
                    category_id=cat_id,
                    price_list_id=pl_id,
                    formula=ft.formula,
                    sales_tax_id=ft.default_sales_tax_id,
                    formula_template_id=ft.id,
                    is_active=True,
                ))
                created += 1
    await db.flush()
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "template": ft.code,
        "formula": ft.formula,
    }


@router.post("/calc-tax")
async def calc_tax_endpoint(
    amount: float = Query(...),
    tax_id: int | None = None,
    tax_percent: float | None = None,
    db: DbSession = None,
    user: CurrentUser = None,
):
    """Auto-calculate tax amount from net amount + tax rate id or percent."""
    pct = tax_percent
    if tax_id and pct is None:
        r = await db.execute(select(TaxRate).where(TaxRate.id == tax_id))
        t = r.scalar_one_or_none()
        pct = float(t.rate) if t else 0.0
    return calc_tax(amount, pct or 0.0)


# ---- Category formulas ----
class FormulaIn(BaseModel):
    category_id: int
    price_list_id: int
    formula: str = "purchase * 1.25"
    sales_tax_id: Optional[int] = None
    formula_template_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True


class FormulaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    price_list_id: int
    formula: str
    sales_tax_id: Optional[int] = None
    formula_template_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool
    price_list_name: Optional[str] = None
    sales_tax_rate: Optional[float] = None
    category_name: Optional[str] = None
    formula_template_name: Optional[str] = None


_FORMULA_LOAD = (
    selectinload(CategoryPriceFormula.price_list),
    selectinload(CategoryPriceFormula.sales_tax),
    selectinload(CategoryPriceFormula.category),
    selectinload(CategoryPriceFormula.formula_template),
)


def _formula_out(f: CategoryPriceFormula) -> FormulaOut:
    return FormulaOut(
        id=f.id,
        category_id=f.category_id,
        price_list_id=f.price_list_id,
        formula=f.formula,
        sales_tax_id=f.sales_tax_id,
        formula_template_id=f.formula_template_id,
        notes=f.notes,
        is_active=f.is_active,
        price_list_name=f.price_list.name if f.price_list else None,
        sales_tax_rate=float(f.sales_tax.rate) if f.sales_tax else None,
        category_name=f.category.name if f.category else None,
        formula_template_name=f.formula_template.name if f.formula_template else None,
    )


async def _load_formula(db, fid: int) -> CategoryPriceFormula | None:
    r = await db.execute(
        select(CategoryPriceFormula).options(*_FORMULA_LOAD).where(CategoryPriceFormula.id == fid)
    )
    return r.scalar_one_or_none()


@router.get("/formulas/duplicates")
async def list_formula_duplicates(db: DbSession, user: CurrentUser):
    """
    Report category×price-list pairs that appear more than once (should be empty
    when uq_category_price_list is enforced). Also list which pairs already have
    a formula so clients can preview apply conflicts.
    """
    from collections import defaultdict
    rows = (await db.execute(
        select(CategoryPriceFormula).options(*_FORMULA_LOAD)
    )).scalars().all()

    by_pair: dict[tuple[int, int], list] = defaultdict(list)
    by_template_pl: dict[tuple[int | None, int], list] = defaultdict(list)
    for f in rows:
        by_pair[(f.category_id, f.price_list_id)].append(f)
        by_template_pl[(f.formula_template_id, f.price_list_id)].append(f)

    duplicates = []
    for (cat_id, pl_id), items in by_pair.items():
        if len(items) > 1:
            duplicates.append({
                "type": "category_price_list",
                "category_id": cat_id,
                "category_name": items[0].category.name if items[0].category else None,
                "price_list_id": pl_id,
                "price_list_name": items[0].price_list.name if items[0].price_list else None,
                "count": len(items),
                "formula_ids": [x.id for x in items],
                "formulas": [x.formula for x in items],
            })

    # template × price_list is allowed across categories; flag only if same
    # template+category+PL somehow duplicated (covered above). Provide occupancy map.
    existing_pairs = [
        {
            "category_id": f.category_id,
            "category_name": f.category.name if f.category else None,
            "price_list_id": f.price_list_id,
            "price_list_name": f.price_list.name if f.price_list else None,
            "formula_id": f.id,
            "formula": f.formula,
            "formula_template_id": f.formula_template_id,
            "formula_template_name": f.formula_template.name if f.formula_template else None,
        }
        for f in rows
    ]

    return {
        "has_duplicates": len(duplicates) > 0,
        "duplicate_count": len(duplicates),
        "duplicates": duplicates,
        "existing_pairs": existing_pairs,
        "total_formulas": len(rows),
    }


class ConflictCheckIn(BaseModel):
    category_ids: list[int]
    price_list_ids: list[int]


@router.post("/formulas/check-conflicts")
async def check_formula_conflicts(
    data: ConflictCheckIn,
    db: DbSession,
    user: CurrentUser,
):
    category_ids = data.category_ids
    price_list_ids = data.price_list_ids
    """Preview which category×price-list cells already have a formula (for apply UI)."""
    if not category_ids or not price_list_ids:
        return {"conflicts": [], "free": []}
    rows = (await db.execute(
        select(CategoryPriceFormula).options(*_FORMULA_LOAD).where(
            CategoryPriceFormula.category_id.in_(category_ids),
            CategoryPriceFormula.price_list_id.in_(price_list_ids),
        )
    )).scalars().all()
    occupied = {(f.category_id, f.price_list_id): f for f in rows}
    conflicts, free = [], []
    for c in category_ids:
        for pl in price_list_ids:
            key = (c, pl)
            if key in occupied:
                f = occupied[key]
                conflicts.append({
                    "category_id": c,
                    "price_list_id": pl,
                    "category_name": f.category.name if f.category else None,
                    "price_list_name": f.price_list.name if f.price_list else None,
                    "formula_id": f.id,
                    "formula": f.formula,
                    "formula_template_name": f.formula_template.name if f.formula_template else None,
                })
            else:
                free.append({"category_id": c, "price_list_id": pl})
    return {
        "conflicts": conflicts,
        "free": free,
        "conflict_count": len(conflicts),
        "free_count": len(free),
    }


@router.get("/formulas", response_model=list[FormulaOut])
async def list_formulas(db: DbSession, user: CurrentUser, category_id: int | None = None):
    q = select(CategoryPriceFormula).options(*_FORMULA_LOAD)
    if category_id:
        q = q.where(CategoryPriceFormula.category_id == category_id)
    rows = (await db.execute(q.order_by(CategoryPriceFormula.id))).scalars().all()
    return [_formula_out(f) for f in rows]


@router.post("/formulas", response_model=FormulaOut, status_code=201)
async def create_formula(data: FormulaIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    try:
        evaluate_formula(data.formula, 100.0)
    except Exception as e:
        raise HTTPException(400, f"Invalid formula: {e}")
    if not data.category_id or not data.price_list_id:
        raise HTTPException(400, "category_id and price_list_id are required")

    # Upsert on unique (category_id, price_list_id)
    existing = (await db.execute(
        select(CategoryPriceFormula).where(
            CategoryPriceFormula.category_id == data.category_id,
            CategoryPriceFormula.price_list_id == data.price_list_id,
        )
    )).scalar_one_or_none()

    payload = data.model_dump()
    # Normalize empty optional FKs
    if not payload.get("sales_tax_id"):
        payload["sales_tax_id"] = None
    if not payload.get("formula_template_id"):
        payload["formula_template_id"] = None

    if existing:
        for k, v in payload.items():
            setattr(existing, k, v)
        await db.flush()
        f = await _load_formula(db, existing.id)
        # Upsert — same category×PL cannot duplicate
        return _formula_out(f)

    f = CategoryPriceFormula(**payload)
    db.add(f)
    try:
        await db.flush()
    except Exception as e:
        raise HTTPException(400, f"Could not save formula: {e}")
    f = await _load_formula(db, f.id)
    return _formula_out(f)


@router.patch("/formulas/{fid}", response_model=FormulaOut)
async def update_formula(fid: int, data: FormulaIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    try:
        evaluate_formula(data.formula, 100.0)
    except Exception as e:
        raise HTTPException(400, f"Invalid formula: {e}")
    r = await db.execute(select(CategoryPriceFormula).where(CategoryPriceFormula.id == fid))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "Not found")
    payload = data.model_dump()
    if not payload.get("sales_tax_id"):
        payload["sales_tax_id"] = None
    if not payload.get("formula_template_id"):
        payload["formula_template_id"] = None
    # Block duplicate category × price-list on another row
    other = (await db.execute(
        select(CategoryPriceFormula).where(
            CategoryPriceFormula.category_id == payload["category_id"],
            CategoryPriceFormula.price_list_id == payload["price_list_id"],
            CategoryPriceFormula.id != fid,
        )
    )).scalar_one_or_none()
    if other:
        raise HTTPException(
            400,
            f"Category×price-list combination already exists (formula #{other.id}). "
            "Edit that formula or choose a different pair.",
        )
    for k, v in payload.items():
        setattr(f, k, v)
    await db.flush()
    f = await _load_formula(db, fid)
    return _formula_out(f)


@router.delete("/formulas/{fid}")
async def delete_formula(fid: int, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    r = await db.execute(select(CategoryPriceFormula).where(CategoryPriceFormula.id == fid))
    f = r.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "Not found")
    await db.delete(f)
    await db.flush()
    return {"ok": True}


@router.get("/products/{product_id}/price")
async def product_price(
    product_id: int,
    db: DbSession,
    user: CurrentUser,
    price_list_id: int | None = None,
):
    r = await db.execute(
        select(Product).options(selectinload(Product.purchase_tax)).where(Product.id == product_id)
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    return await compute_sales_price(db, p, price_list_id)


@router.post("/preview-formula")
async def preview_formula(formula: str = Query(...), purchase: float = Query(100.0), user: CurrentUser = None):  # noqa: ARG001
    try:
        return {"result": evaluate_formula(formula, purchase)}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/price-matrix")
async def price_matrix(
    db: DbSession,
    user: CurrentUser,
    category_id: int | None = None,
    limit: int = Query(50, le=200),
):
    """What-if matrix: products × all price lists with computed sales prices."""
    from app.models.product import Product
    from app.models.pricing import PriceList
    from sqlalchemy.orm import selectinload as sil

    pq = select(Product).options(sil(Product.category), sil(Product.purchase_tax)).limit(limit)
    if category_id:
        pq = pq.where(Product.category_id == category_id)
    products = (await db.execute(pq)).scalars().all()
    lists = (await db.execute(select(PriceList).where(PriceList.is_active == True).order_by(PriceList.sort_order))).scalars().all()
    rows = []
    for prod in products:
        cells = {}
        for pl in lists:
            cells[pl.code] = await compute_sales_price(db, prod, pl.id)
        purchase = await get_purchase_breakdown(db, prod)
        rows.append({
            "product_id": prod.id,
            "sku": prod.sku,
            "name": prod.name,
            "category": prod.category.name if prod.category else None,
            "purchase": purchase,
            "lists": {pl.code: cells[pl.code] for pl in lists},
        })
    return {
        "price_lists": [{"id": pl.id, "code": pl.code, "name": pl.name} for pl in lists],
        "rows": rows,
    }
