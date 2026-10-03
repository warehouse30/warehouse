from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
from app.models.currency import Currency


async def get_default_currency(db: AsyncSession) -> Currency:
    r = await db.execute(select(Currency).where(Currency.is_default == True))
    c = r.scalar_one_or_none()
    if c:
        return c
    r = await db.execute(select(Currency).where(Currency.code == "USD"))
    c = r.scalar_one_or_none()
    if c:
        return c
    raise HTTPException(400, "No default currency configured. Create USD or set a default.")


async def get_currency_by_code(db: AsyncSession, code: str) -> Currency:
    r = await db.execute(select(Currency).where(Currency.code == code.upper()))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, f"Currency {code} not found")
    return c


def convert_amount(
    amount: float | Decimal,
    from_rate: float | Decimal,
    to_rate: float | Decimal,
) -> float:
    """
    Rates are: 1 unit of currency = rate units of base (default).
    amount_in_base = amount * from_rate
    amount_in_to = amount_in_base / to_rate
    """
    a = float(amount or 0)
    fr = float(from_rate or 1)
    tr = float(to_rate or 1)
    if tr == 0:
        raise HTTPException(400, "Target currency rate cannot be zero")
    return round((a * fr) / tr, 8)


async def convert(
    db: AsyncSession,
    amount: float | Decimal,
    from_code: str,
    to_code: str,
) -> dict:
    if from_code.upper() == to_code.upper():
        return {
            "amount": float(amount),
            "from": from_code.upper(),
            "to": to_code.upper(),
            "rate": 1.0,
            "converted": float(amount),
        }
    src = await get_currency_by_code(db, from_code)
    dst = await get_currency_by_code(db, to_code)
    converted = convert_amount(amount, src.rate, dst.rate)
    cross = float(src.rate) / float(dst.rate) if float(dst.rate) else 0
    return {
        "amount": float(amount),
        "from": src.code,
        "to": dst.code,
        "rate": round(cross, 8),
        "converted": converted,
        "from_rate_vs_base": float(src.rate),
        "to_rate_vs_base": float(dst.rate),
    }
