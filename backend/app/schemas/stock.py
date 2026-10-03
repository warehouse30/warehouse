from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class StockAdjustment(BaseModel):
    """Single product stock change (used by scanner & bulk)."""
    product_id: Optional[int] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    quantity_delta: Decimal = Field(..., description="Positive = add, negative = remove")
    warehouse_id: int
    reason: Optional[str] = "scan"
    expected_version: Optional[int] = None  # optimistic lock


class StockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    warehouse_id: int
    product_id: int
    quantity: Decimal
    reserved: Decimal
    available: Decimal
    version: int
    updated_at: datetime
    product_sku: Optional[str] = None
    product_name: Optional[str] = None
    product_barcode: Optional[str] = None
    warehouse_code: Optional[str] = None


class StockBulkItem(BaseModel):
    sku: str
    quantity: Decimal
    warehouse_code: Optional[str] = None


class StockFilter(BaseModel):
    warehouse_id: Optional[int] = None
    category_id: Optional[int] = None
    search: Optional[str] = None  # sku / name / barcode
    low_stock_only: bool = False
    page: int = 1
    page_size: int = 50
