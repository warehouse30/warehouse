from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select, update
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from decimal import Decimal
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.models.currency import Currency, ExchangeRateHistory
from app.services.currency_service import convert, get_default_currency

router = APIRouter()


class CurrencyIn(BaseModel):
    code: str = Field(min_length=3, max_length=10)
    name: str
    symbol: str = "$"
    decimal_places: int = 2
    rate: Decimal = Decimal("1")
    is_active: bool = True
    is_default: bool = False


class CurrencyUpdate(BaseModel):
    name: Optional[str] = None
    symbol: Optional[str] = None
    decimal_places: Optional[int] = None
    rate: Optional[Decimal] = None
    is_active: Optional[bool] = None


class RateUpdate(BaseModel):
    rate: Decimal = Field(gt=0)
    note: Optional[str] = None


def _out(c: Currency) -> dict:
    return {
        "id": c.id,
        "code": c.code,
        "name": c.name,
        "symbol": c.symbol,
        "decimal_places": c.decimal_places,
        "rate": float(c.rate),
        "is_default": c.is_default,
        "is_active": c.is_active,
        "rate_updated_at": c.rate_updated_at.isoformat() if c.rate_updated_at else None,
    }


@router.get("")
async def list_currencies(db: DbSession, user: CurrentUser, active_only: bool = False):
    q = select(Currency).order_by(Currency.is_default.desc(), Currency.code)
    if active_only:
        q = q.where(Currency.is_active == True)
    rows = (await db.execute(q)).scalars().all()
    default = next((c for c in rows if c.is_default), None)
    return {
        "default_code": default.code if default else "USD",
        "items": [_out(c) for c in rows],
    }


@router.get("/default")
async def get_default(db: DbSession, user: CurrentUser):
    c = await get_default_currency(db)
    return _out(c)


@router.post("", status_code=201)
async def create_currency(
    data: CurrencyIn,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    code = data.code.upper().strip()
    exists = (await db.execute(select(Currency).where(Currency.code == code))).scalar_one_or_none()
    if exists:
        raise HTTPException(400, f"Currency {code} already exists")
    if data.is_default:
        await db.execute(update(Currency).values(is_default=False))
        rate = Decimal("1")
    else:
        rate = data.rate
    c = Currency(
        code=code,
        name=data.name,
        symbol=data.symbol,
        decimal_places=data.decimal_places,
        rate=rate,
        is_default=data.is_default,
        is_active=data.is_active,
        rate_updated_at=datetime.now(timezone.utc),
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return _out(c)


@router.patch("/{currency_id}")
async def update_currency(
    currency_id: int,
    data: CurrencyUpdate,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    c = (await db.execute(select(Currency).where(Currency.id == currency_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    payload = data.model_dump(exclude_unset=True)
    if "rate" in payload and c.is_default:
        # default currency rate is always 1
        payload["rate"] = Decimal("1")
    if "rate" in payload:
        old = float(c.rate)
        c.rate = payload.pop("rate")
        c.rate_updated_at = datetime.now(timezone.utc)
        db.add(ExchangeRateHistory(
            currency_id=c.id,
            rate=c.rate,
            note=f"updated from {old}",
            created_by=user.id,
        ))
    for k, v in payload.items():
        setattr(c, k, v)
    await db.flush()
    return _out(c)


@router.put("/{currency_id}/rate")
async def set_rate(
    currency_id: int,
    data: RateUpdate,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    c = (await db.execute(select(Currency).where(Currency.id == currency_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    if c.is_default:
        raise HTTPException(400, "Default (base) currency rate is fixed at 1")
    old = float(c.rate)
    c.rate = data.rate
    c.rate_updated_at = datetime.now(timezone.utc)
    db.add(ExchangeRateHistory(
        currency_id=c.id,
        rate=data.rate,
        note=data.note or f"from {old}",
        created_by=user.id,
    ))
    await db.flush()
    return _out(c)


@router.post("/{currency_id}/set-default")
async def set_default(
    currency_id: int,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    """
    Change system base currency.
    Recalculates all rates so relative values stay consistent:
    new_rate = old_rate / new_default_old_rate
    """
    target = (await db.execute(select(Currency).where(Currency.id == currency_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Not found")
    if not target.is_active:
        raise HTTPException(400, "Cannot set inactive currency as default")

    old_default_rate = float(target.rate)  # target's rate vs current base
    if old_default_rate <= 0:
        raise HTTPException(400, "Invalid rate on target currency")

    all_c = (await db.execute(select(Currency))).scalars().all()
    now = datetime.now(timezone.utc)
    for c in all_c:
        if c.id == target.id:
            c.is_default = True
            c.rate = 1
        else:
            c.is_default = False
            # express old value in new base
            c.rate = float(c.rate) / old_default_rate
        c.rate_updated_at = now
        db.add(ExchangeRateHistory(
            currency_id=c.id,
            rate=c.rate,
            note=f"base changed to {target.code}",
            created_by=user.id,
        ))
    await db.flush()
    return {
        "default_code": target.code,
        "message": f"Default currency set to {target.code}",
        "items": [_out(c) for c in all_c],
    }


@router.get("/convert")
async def convert_endpoint(
    db: DbSession,
    user: CurrentUser,
    amount: float = Query(...),
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
):
    return await convert(db, amount, from_currency, to_currency)


@router.get("/{currency_id}/history")
async def rate_history(currency_id: int, db: DbSession, user: CurrentUser, limit: int = 50):
    r = await db.execute(
        select(ExchangeRateHistory)
        .where(ExchangeRateHistory.currency_id == currency_id)
        .order_by(ExchangeRateHistory.id.desc())
        .limit(limit)
    )
    return [
        {
            "id": h.id,
            "rate": float(h.rate),
            "note": h.note,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in r.scalars().all()
    ]
