from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Hikvision DS-K1T510EBWX-E1 (or compatible) access controller
    gate_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    gate_host: Mapped[str | None] = mapped_column(String(255), nullable=True)  # IP or hostname
    gate_port: Mapped[int] = mapped_column(Integer, default=80)
    gate_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gate_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # store encrypted in prod
    gate_door_no: Mapped[int] = mapped_column(Integer, default=1)
    gate_use_https: Mapped[bool] = mapped_column(Boolean, default=False)
    gate_open_on_print: Mapped[bool] = mapped_column(Boolean, default=True)  # remote-open door when slip is printed
    gate_model: Mapped[str | None] = mapped_column(String(100), default="DS-K1T510EBWX-E1")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    stocks = relationship("Stock", back_populates="warehouse")
    slips = relationship("Slip", back_populates="warehouse")
