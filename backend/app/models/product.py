from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sku: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(100), unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    unit: Mapped[str] = mapped_column(String(50), default="pcs")
    min_stock: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    bin_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Pricing
    purchase_price: Mapped[float] = mapped_column(Numeric(14, 4), default=0)  # excl. tax
    purchase_currency: Mapped[str] = mapped_column(String(10), default="USD")  # ISO code
    purchase_tax_id: Mapped[int | None] = mapped_column(ForeignKey("tax_rates.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    category = relationship("Category", back_populates="products")
    stocks = relationship("Stock", back_populates="product")
    purchase_tax = relationship("TaxRate", foreign_keys=[purchase_tax_id])
