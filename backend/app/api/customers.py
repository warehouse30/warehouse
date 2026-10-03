from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, ConfigDict
from typing import Optional
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.customer import Customer

router = APIRouter()


class CustomerIn(BaseModel):
    code: str
    name: str
    company_name: Optional[str] = None
    area: Optional[str] = None
    branch: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    default_price_list_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True


class CustomerOut(CustomerIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    default_price_list_name: Optional[str] = None


def _out(c: Customer) -> CustomerOut:
    return CustomerOut(
        id=c.id,
        code=c.code,
        name=c.name,
        company_name=c.company_name,
        area=c.area,
        branch=c.branch,
        email=c.email,
        phone=c.phone,
        address=c.address,
        tax_id=c.tax_id,
        default_price_list_id=c.default_price_list_id,
        notes=c.notes,
        is_active=c.is_active,
        default_price_list_name=c.default_price_list.name if c.default_price_list else None,
    )


@router.get("", response_model=list[CustomerOut])
async def list_customers(db: DbSession, user: CurrentUser, search: str | None = None, active_only: bool = True):
    q = select(Customer).options(selectinload(Customer.default_price_list)).order_by(Customer.name)
    if active_only:
        q = q.where(Customer.is_active == True)
    if search:
        t = f"%{search}%"
        q = q.where(or_(Customer.name.ilike(t), Customer.company_name.ilike(t), Customer.area.ilike(t), Customer.branch.ilike(t), Customer.code.ilike(t), Customer.email.ilike(t)))
    return [_out(c) for c in (await db.execute(q)).scalars().all()]


@router.post("", response_model=CustomerOut, status_code=201)
async def create_customer(data: CustomerIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WORKER))):
    if (await db.execute(select(Customer).where(Customer.code == data.code))).scalar_one_or_none():
        raise HTTPException(400, "Customer code exists")
    c = Customer(**data.model_dump())
    db.add(c)
    await db.flush()
    r = await db.execute(select(Customer).options(selectinload(Customer.default_price_list)).where(Customer.id == c.id))
    return _out(r.scalar_one())


@router.patch("/{cid}", response_model=CustomerOut)
async def update_customer(cid: int, data: CustomerIn, db: DbSession, user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WORKER))):
    r = await db.execute(select(Customer).where(Customer.id == cid))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    await db.flush()
    r = await db.execute(select(Customer).options(selectinload(Customer.default_price_list)).where(Customer.id == cid))
    return _out(r.scalar_one())


@router.get("/{cid}", response_model=CustomerOut)
async def get_customer(cid: int, db: DbSession, user: CurrentUser):
    r = await db.execute(select(Customer).options(selectinload(Customer.default_price_list)).where(Customer.id == cid))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    return _out(c)
