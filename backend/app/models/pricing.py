from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Numeric, Text, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class TaxRate(Base):
    __tablename__ = "tax_rates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PriceList(Base):
    __tablename__ = "price_lists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    formulas = relationship("CategoryPriceFormula", back_populates="price_list")


class FormulaTemplate(Base):
    """
    Reusable formula templates (e.g. "Standard +25%", "Distributor +10%+2").
    Can be applied to one or many category × price-list combinations.
    """
    __tablename__ = "formula_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    formula: Mapped[str] = mapped_column(String(255), nullable=False, default="purchase * 1.25")
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_sales_tax_id: Mapped[int | None] = mapped_column(ForeignKey("tax_rates.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    default_sales_tax = relationship("TaxRate")


class CategoryPriceFormula(Base):
    __tablename__ = "category_price_formulas"
    __table_args__ = (
        UniqueConstraint("category_id", "price_list_id", name="uq_category_price_list"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    price_list_id: Mapped[int] = mapped_column(ForeignKey("price_lists.id"), nullable=False, index=True)
    formula: Mapped[str] = mapped_column(String(255), nullable=False, default="purchase * 1.25")
    sales_tax_id: Mapped[int | None] = mapped_column(ForeignKey("tax_rates.id"), nullable=True)
    formula_template_id: Mapped[int | None] = mapped_column(ForeignKey("formula_templates.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    category = relationship("Category", backref="price_formulas")
    price_list = relationship("PriceList", back_populates="formulas")
    sales_tax = relationship("TaxRate", foreign_keys=[sales_tax_id])
    formula_template = relationship("FormulaTemplate")
