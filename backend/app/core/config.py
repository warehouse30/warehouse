from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional

# Project-local data dir (works on Windows + Linux; avoids /tmp which fails on Windows)
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_DATA_DIR = _BACKEND_ROOT / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_DEFAULT_DB = _DATA_DIR / "warehouse.db"
# aiosqlite needs 4 slashes for absolute path: sqlite+aiosqlite:////path
_DEFAULT_URL = f"sqlite+aiosqlite:///{_DEFAULT_DB.as_posix()}"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Warehouse Inventory System"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"

    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8

    # Default: backend/data/warehouse.db (portable). Override with DATABASE_URL env var.
    DATABASE_URL: str = _DEFAULT_URL

    EXTERNAL_QR_API_URL: Optional[str] = None
    EXTERNAL_QR_API_KEY: Optional[str] = None
    QR_FALLBACK_ENABLED: bool = True

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
