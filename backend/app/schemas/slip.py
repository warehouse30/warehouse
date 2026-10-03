from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.slip import SlipType, SlipStatus


class SlipItemCreate(BaseModel):
    product_id: Optional[int] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    quantity: Decimal
    notes: Optional[str] = None


class SlipItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_id: int
    quantity: Decimal
    notes: Optional[str] = None
    product_sku: Optional[str] = None
    product_name: Optional[str] = None


class SlipCreate(BaseModel):
    slip_type: SlipType
    warehouse_id: int
    customer_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    items: List[SlipItemCreate] = Field(min_length=1)


class SlipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    slip_number: str
    slip_type: SlipType
    status: SlipStatus
    warehouse_id: int
    created_by: int
    customer_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    qr_payload: Optional[str] = None
    qr_image_b64: Optional[str] = None
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    items: List[SlipItemOut] = []
    warehouse_code: Optional[str] = None
    created_by_name: Optional[str] = None


class SlipConfirm(BaseModel):
    confirm: bool = True
