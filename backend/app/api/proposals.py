from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Response, Query
from sqlalchemy import select, desc, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Literal
from decimal import Decimal
import re
from jinja2 import TemplateError
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.proposal import Proposal, ProposalItem, ProposalTemplate, ProposalStatus
from app.models.product import Product
from app.models.customer import Customer
from app.services.pricing_service import compute_sales_price
from app.services.proposal_render import render_html, render_template_preview, export_pdf, export_excel, export_image, DEFAULT_HTML

router = APIRouter()


class TemplateIn(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    body_html: str
    css: Optional[str] = None
    page_size: str = "A4"
    is_default: bool = False
    is_active: bool = True


class TemplatePreviewIn(BaseModel):
    body_html: str
    css: Optional[str] = None


class TemplateOut(TemplateIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ProposalItemIn(BaseModel):
    product_id: Optional[int] = None
    sku: Optional[str] = None
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    quantity: Decimal = Decimal("1")
    unit: str = "pcs"
    unit_price: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")


class ProposalIn(BaseModel):
    customer_id: int
    price_list_id: Optional[int] = None
    template_id: Optional[int] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    currency: str = "TRY"
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    items: List[ProposalItemIn] = Field(min_length=1)


class ProposalStatusIn(BaseModel):
    status: Literal["draft", "accepted", "cancelled"]


class ProposalItemOut(ProposalItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: str
    customer_id: int
    price_list_id: Optional[int] = None
    template_id: Optional[int] = None
    status: str
    title: Optional[str] = None
    notes: Optional[str] = None
    currency: str
    discount_percent: Decimal = Decimal("0")
    created_at: datetime
    customer_name: Optional[str] = None
    price_list_name: Optional[str] = None
    items: List[ProposalItemOut] = []


def _proposal_out(p: Proposal) -> ProposalOut:
    return ProposalOut(
        id=p.id,
        number=p.number,
        customer_id=p.customer_id,
        price_list_id=p.price_list_id,
        template_id=p.template_id,
        status=p.status.value if p.status else "draft",
        title=p.title,
        notes=p.notes,
        currency=p.currency,
        discount_percent=p.discount_percent or 0,
        created_at=p.created_at,
        customer_name=p.customer.name if p.customer else None,
        price_list_name=p.price_list.name if p.price_list else None,
        items=[
            ProposalItemOut(
                id=it.id,
                product_id=it.product_id,
                sku=it.sku,
                name=it.name,
                description=it.description,
                image_url=it.image_url,
                quantity=it.quantity,
                unit=it.unit,
                unit_price=it.unit_price,
                tax_rate=it.tax_rate,
            )
            for it in p.items
        ],
    )


async def _load(db, pid: int) -> Proposal | None:
    r = await db.execute(
        select(Proposal)
        .options(
            selectinload(Proposal.items).selectinload(ProposalItem.product),
            selectinload(Proposal.customer),
            selectinload(Proposal.price_list),
            selectinload(Proposal.template),
        )
        .where(Proposal.id == pid)
    )
    return r.scalar_one_or_none()


# ---- Templates ----
@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(db: DbSession, user: CurrentUser):
    r = await db.execute(select(ProposalTemplate).order_by(ProposalTemplate.name))
    return r.scalars().all()


@router.get("/templates/default-body")
async def default_template_body(user: CurrentUser):
    return {"body_html": DEFAULT_HTML, "css": ""}


@router.post("/templates/preview")
async def preview_template(data: TemplatePreviewIn, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    try:
        html = render_template_preview(data.body_html, data.css)
    except TemplateError as exc:
        raise HTTPException(status_code=422, detail=f"Template syntax error: {exc}") from exc
    return Response(content=html, media_type="text/html")


@router.post("/templates", response_model=TemplateOut, status_code=201)
async def create_template(data: TemplateIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    if data.is_default:
        for t in (await db.execute(select(ProposalTemplate).where(ProposalTemplate.is_default == True))).scalars().all():
            t.is_default = False
    t = ProposalTemplate(**data.model_dump())
    db.add(t)
    try:
        await db.flush()
        await db.refresh(t)
    except IntegrityError as exc:
        raise HTTPException(409, "A template with this code already exists") from exc
    return t


@router.patch("/templates/{tid}", response_model=TemplateOut)
async def update_template(tid: int, data: TemplateIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    r = await db.execute(select(ProposalTemplate).where(ProposalTemplate.id == tid))
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Not found")
    if data.is_default:
        for x in (await db.execute(select(ProposalTemplate).where(ProposalTemplate.is_default == True))).scalars().all():
            x.is_default = False
    for k, v in data.model_dump().items():
        setattr(t, k, v)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(409, "A template with this code already exists") from exc
    return t


@router.delete("/templates/{tid}", status_code=204)
async def delete_template(tid: int, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))):
    r = await db.execute(select(ProposalTemplate).where(ProposalTemplate.id == tid))
    template = r.scalar_one_or_none()
    if not template:
        raise HTTPException(404, "Template not found")
    usage_count = await db.scalar(select(func.count(Proposal.id)).where(Proposal.template_id == tid))
    if usage_count:
        raise HTTPException(409, "This template is used by existing proposals and cannot be deleted")
    await db.delete(template)
    return Response(status_code=204)


@router.get("/templates/{tid}", response_model=TemplateOut)
async def get_template(tid: int, db: DbSession, user: CurrentUser):
    r = await db.execute(select(ProposalTemplate).where(ProposalTemplate.id == tid))
    t = r.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Not found")
    return t


# ---- Proposals ----
@router.get("", response_model=list[ProposalOut])
async def list_proposals(db: DbSession, user: CurrentUser, limit: int = Query(50, le=200)):
    r = await db.execute(
        select(Proposal)
        .options(
            selectinload(Proposal.items),
            selectinload(Proposal.customer),
            selectinload(Proposal.price_list),
        )
        .order_by(desc(Proposal.id))
        .limit(limit)
    )
    return [_proposal_out(p) for p in r.scalars().all()]


@router.post("", response_model=ProposalOut, status_code=201)
async def create_proposal(data: ProposalIn, db: DbSession, user: CurrentUser):
    # resolve customer default price list
    price_list_id = data.price_list_id
    if not price_list_id:
        cr = await db.execute(select(Customer).where(Customer.id == data.customer_id))
        cust = cr.scalar_one_or_none()
        if cust and cust.default_price_list_id:
            price_list_id = cust.default_price_list_id

    last = (await db.execute(select(Proposal).order_by(desc(Proposal.id)).limit(1))).scalar_one_or_none()
    seq = (last.id + 1) if last else 1
    number = f"PR-{datetime.now().strftime('%Y%m%d')}-{seq:04d}"

    p = Proposal(
        number=number,
        customer_id=data.customer_id,
        price_list_id=price_list_id,
        template_id=data.template_id,
        title=data.title,
        notes=data.notes,
        currency=data.currency,
        discount_percent=data.discount_percent,
        created_by=user.id,
        status=ProposalStatus.DRAFT,
    )
    db.add(p)
    await db.flush()

    for i, it in enumerate(data.items):
        unit_price = float(it.unit_price)
        tax_rate = float(it.tax_rate)
        image_url = it.image_url
        sku = it.sku
        name = it.name
        if it.product_id:
            pr = await db.execute(select(Product).where(Product.id == it.product_id))
            prod = pr.scalar_one_or_none()
            if prod:
                sku = sku or prod.sku
                name = name or prod.name
                image_url = image_url or prod.photo_url
                if unit_price == 0 and price_list_id:
                    priced = await compute_sales_price(db, prod, price_list_id)
                    unit_price = priced["sales_unit_price"]
                    tax_rate = priced["tax_percent"]
        db.add(ProposalItem(
            proposal_id=p.id,
            product_id=it.product_id,
            sku=sku,
            name=name,
            description=it.description,
            image_url=image_url,
            quantity=it.quantity,
            unit=it.unit,
            unit_price=unit_price,
            tax_rate=tax_rate,
            sort_order=i,
        ))
    await db.flush()
    p = await _load(db, p.id)
    return _proposal_out(p)


@router.get("/{pid}", response_model=ProposalOut)
async def get_proposal(pid: int, db: DbSession, user: CurrentUser):
    p = await _load(db, pid)
    if not p:
        raise HTTPException(404, "Not found")
    return _proposal_out(p)


@router.patch("/{pid}/status", response_model=ProposalOut)
async def update_proposal_status(pid: int, data: ProposalStatusIn, db: DbSession, user: CurrentUser):
    proposal = await _load(db, pid)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    proposal.status = ProposalStatus(data.status)
    await db.flush()
    updated = await _load(db, pid)
    return _proposal_out(updated)


def _version_label(number: int) -> str:
    label = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        label = chr(65 + remainder) + label
    return label


async def _next_proposal_version(db: DbSession, number: str) -> str:
    match = re.match(r"^(.*)_([A-Z]+)$", number)
    base = match.group(1) if match else number
    result = await db.execute(select(Proposal.number).where(Proposal.number.startswith(f"{base}_")))
    latest = 0
    for (existing_number,) in result.all():
        suffix = existing_number[len(base) + 1:]
        if suffix.isalpha() and suffix.isupper():
            value = 0
            for char in suffix:
                value = value * 26 + ord(char) - 64
            latest = max(latest, value)
    return f"{base}_{_version_label(latest + 1)}"


@router.put("/{pid}", response_model=ProposalOut)
async def create_proposal_version(pid: int, data: ProposalIn, db: DbSession, user: CurrentUser):
    original = await _load(db, pid)
    if not original:
        raise HTTPException(404, "Proposal not found")

    existing_items = list(original.items)
    item_changed = len(existing_items) != len(data.items)
    if not item_changed:
        for old, new in zip(existing_items, data.items):
            values = (
                old.product_id == new.product_id
                and (old.sku or "") == (new.sku or "")
                and old.name == new.name
                and (old.description or "") == (new.description or "")
                and (old.image_url or "") == (new.image_url or "")
                and (old.unit or "pcs") == new.unit
                and Decimal(str(old.quantity or 0)) == new.quantity
                and Decimal(str(old.unit_price or 0)) == new.unit_price
                and Decimal(str(old.tax_rate or 0)) == new.tax_rate
            )
            if not values:
                item_changed = True
                break

    changed = item_changed or (
        original.customer_id != data.customer_id
        or original.price_list_id != data.price_list_id
        or original.template_id != data.template_id
        or original.title != data.title
        or (original.notes or "") != (data.notes or "")
        or original.currency != data.currency
        or Decimal(str(original.discount_percent or 0)) != data.discount_percent
    )
    if not changed:
        return _proposal_out(original)

    version = Proposal(
        number=await _next_proposal_version(db, original.number),
        customer_id=data.customer_id,
        price_list_id=data.price_list_id,
        template_id=data.template_id,
        status=ProposalStatus.DRAFT,
        title=data.title,
        notes=data.notes,
        currency=data.currency,
        discount_percent=data.discount_percent,
        valid_until=original.valid_until,
        created_by=user.id,
    )
    db.add(version)
    await db.flush()

    for index, item in enumerate(data.items):
        product = None
        if item.product_id:
            product = await db.get(Product, item.product_id)
        db.add(ProposalItem(
            proposal_id=version.id,
            product_id=item.product_id,
            sku=item.sku or (product.sku if product else None),
            name=item.name or (product.name if product else ""),
            description=item.description,
            image_url=item.image_url or (product.photo_url if product else None),
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            sort_order=index,
        ))
    await db.flush()
    updated = await _load(db, version.id)
    return _proposal_out(updated)


@router.delete("/{pid}", status_code=204)
async def delete_proposal(pid: int, db: DbSession, user: CurrentUser):
    proposal = await _load(db, pid)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    await db.delete(proposal)
    return Response(status_code=204)


@router.get("/{pid}/preview")
async def preview_html(pid: int, db: DbSession, user: CurrentUser):
    p = await _load(db, pid)
    if not p:
        raise HTTPException(404, "Not found")
    html = render_html(p, p.template)
    return Response(content=html, media_type="text/html")


@router.get("/{pid}/export/pdf")
async def exp_pdf(pid: int, db: DbSession, user: CurrentUser):
    p = await _load(db, pid)
    if not p:
        raise HTTPException(404, "Not found")
    data = export_pdf(p, p.template)
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{p.number}.pdf"'})


@router.get("/{pid}/export/excel")
async def exp_xlsx(pid: int, db: DbSession, user: CurrentUser):
    p = await _load(db, pid)
    if not p:
        raise HTTPException(404, "Not found")
    data = export_excel(render_html(p, p.template))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{p.number}.xlsx"'},
    )


@router.get("/{pid}/export/image")
async def exp_img(pid: int, db: DbSession, user: CurrentUser):
    p = await _load(db, pid)
    if not p:
        raise HTTPException(404, "Not found")
    data = export_image(p)
    return Response(content=data, media_type="image/png",
                    headers={"Content-Disposition": f'attachment; filename="{p.number}.png"'})


@router.post("/{pid}/to-slip")
async def proposal_to_slip(
    pid: int,
    warehouse_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """Create DRAFT outbound slip from proposal and reserve stock until confirm/cancel."""
    from app.models.slip import Slip, SlipItem, SlipStatus, SlipType
    from app.services.slip_service import reserve_stock, _next_slip_number
    from app.services.qr_service import get_qr_for_slip
    from app.models.proposal import ProposalStatus
    from app.services.notify import notify

    p = await _load(db, pid)
    if not p:
        raise HTTPException(404, "Not found")
    if not p.items:
        raise HTTPException(400, "Proposal has no lines")

    number = await _next_slip_number(db, "GP")
    slip = Slip(
        slip_number=number,
        warehouse_id=warehouse_id,
        slip_type=SlipType.OUT,
        status=SlipStatus.DRAFT,
        notes=f"From proposal {p.number}",
        customer_name=p.customer.name if p.customer else None,
        created_by=user.id,
    )
    db.add(slip)
    await db.flush()

    for it in p.items:
        if not it.product_id:
            continue
        qty = float(it.quantity or 0)
        if qty <= 0:
            continue
        await reserve_stock(db, it.product_id, warehouse_id, qty)
        db.add(SlipItem(slip_id=slip.id, product_id=it.product_id, quantity=qty))

    payload, img_b64 = await get_qr_for_slip(
        number, warehouse_id, {"type": "out", "proposal": p.number}
    )
    slip.qr_payload = payload
    slip.qr_image_b64 = img_b64

    try:
        p.status = ProposalStatus.ACCEPTED
    except Exception:
        pass
    await notify(db, f"Slip {number} from proposal {p.number}", "Stock reserved (draft)", "info", "/slips")
    await db.flush()
    return {
        "slip_id": slip.id,
        "slip_number": number,
        "proposal_id": p.id,
        "status": "draft",
        "reserved": True,
        "message": "Draft slip created with stock reservation. Confirm to ship or cancel to release.",
    }

