from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from decimal import Decimal


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class ProductBase(BaseModel):
    sku: str
    barcode: Optional[str] = None
    name: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    unit: str = "pcs"
    min_stock: Decimal = Decimal("0")
    bin_location: Optional[str] = None
    photo_url: Optional[str] = None
    purchase_price: Decimal = Decimal("0")
    purchase_currency: str = "USD"
    purchase_tax_id: Optional[int] = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    barcode: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    unit: Optional[str] = None
    min_stock: Optional[Decimal] = None
    bin_location: Optional[str] = None
    photo_url: Optional[str] = None
    purchase_price: Optional[Decimal] = None
    purchase_currency: Optional[str] = None
    purchase_tax_id: Optional[int] = None


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryOut] = None
