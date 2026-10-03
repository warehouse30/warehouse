from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Currency(Base):
    """System currencies. Exactly one should be is_default (base for rates)."""
    __tablename__ = "currencies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, index=True, nullable=False)  # USD, EUR, TRY
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    symbol: Mapped[str] = mapped_column(String(10), default="$")
    decimal_places: Mapped[int] = mapped_column(default=2)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)  # base currency
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Rate relative to default: 1 unit of this currency = rate units of default currency
    # Default currency always has rate = 1
    rate: Mapped[float] = mapped_column(Numeric(18, 8), default=1)
    rate_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ExchangeRateHistory(Base):
    """Optional audit of rate changes."""
    __tablename__ = "exchange_rate_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    currency_id: Mapped[int] = mapped_column(ForeignKey("currencies.id"), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    currency = relationship("Currency")
