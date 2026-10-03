from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Numeric, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Stock(Base):
    __tablename__ = "stocks"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "product_id", name="uq_warehouse_product"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0, nullable=False)
    reserved: Mapped[float] = mapped_column(Numeric(12, 3), default=0, nullable=False)  # reserved for pending slips
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)  # optimistic concurrency
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    warehouse = relationship("Warehouse", back_populates="stocks")
    product = relationship("Product", back_populates="stocks")

    @property
    def available(self) -> float:
        return float(self.quantity) - float(self.reserved)
