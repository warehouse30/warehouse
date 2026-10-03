from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Numeric, Integer, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.core.database import Base


class CycleCountStatus(str, enum.Enum):
    OPEN = "open"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CycleCount(Base):
    __tablename__ = "cycle_counts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    status: Mapped[CycleCountStatus] = mapped_column(SAEnum(CycleCountStatus), default=CycleCountStatus.OPEN)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    warehouse = relationship("Warehouse")
    lines = relationship("CycleCountLine", back_populates="cycle_count", cascade="all, delete-orphan")


class CycleCountLine(Base):
    __tablename__ = "cycle_count_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cycle_count_id: Mapped[int] = mapped_column(ForeignKey("cycle_counts.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    system_qty: Mapped[float] = mapped_column(Numeric(12, 3), default=0)  # snapshot at count time
    counted_qty: Mapped[float | None] = mapped_column(Numeric(12, 3), nullable=True)
    variance: Mapped[float | None] = mapped_column(Numeric(12, 3), nullable=True)
    counted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    counted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cycle_count = relationship("CycleCount", back_populates="lines")
    product = relationship("Product")
