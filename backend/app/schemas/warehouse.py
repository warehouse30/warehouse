from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime


class GateConfig(BaseModel):
    gate_enabled: bool = False
    gate_host: Optional[str] = None
    gate_port: int = 80
    gate_username: Optional[str] = None
    gate_password: Optional[str] = None
    gate_door_no: int = 1
    gate_use_https: bool = False
    gate_open_on_print: bool = True
    gate_model: Optional[str] = "DS-K1T510EBWX-E1"


class WarehouseBase(BaseModel):
    code: str
    name: str
    address: Optional[str] = None


class WarehouseCreate(WarehouseBase, GateConfig):
    pass


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    gate_enabled: Optional[bool] = None
    gate_host: Optional[str] = None
    gate_port: Optional[int] = None
    gate_username: Optional[str] = None
    gate_password: Optional[str] = None
    gate_door_no: Optional[int] = None
    gate_use_https: Optional[bool] = None
    gate_open_on_print: Optional[bool] = None
    gate_model: Optional[str] = None


class WarehouseOut(WarehouseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    gate_enabled: bool = False
    gate_host: Optional[str] = None
    gate_port: int = 80
    gate_username: Optional[str] = None
    # password intentionally omitted from responses
    gate_door_no: int = 1
    gate_use_https: bool = False
    gate_open_on_print: bool = True
    gate_model: Optional[str] = None
    created_at: datetime
