from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Numeric, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.core.database import Base


class SlipType(str, enum.Enum):
    IN = "in"           # goods receipt
    OUT = "out"         # dispatch / gate-pass
    TRANSFER = "transfer"
    ADJUST = "adjust"   # stock count adjustment


class SlipStatus(str, enum.Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    PRINTED = "printed"


class Slip(Base):
    __tablename__ = "slips"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slip_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    slip_type: Mapped[SlipType] = mapped_column(SAEnum(SlipType), nullable=False)
    status: Mapped[SlipStatus] = mapped_column(SAEnum(SlipStatus), default=SlipStatus.DRAFT)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vehicle_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_payload: Mapped[str | None] = mapped_column(Text, nullable=True)  # signed token or external QR data
    qr_image_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    warehouse = relationship("Warehouse", back_populates="slips")
    created_by_user = relationship("User", back_populates="slips")
    items = relationship("SlipItem", back_populates="slip", cascade="all, delete-orphan")


class SlipItem(Base):
    __tablename__ = "slip_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slip_id: Mapped[int] = mapped_column(ForeignKey("slips.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    slip = relationship("Slip", back_populates="items")
    product = relationship("Product")
