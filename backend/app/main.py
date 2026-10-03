from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import engine, Base
from app.core.logging import setup_logging, get_logger
from app.api import api_router

settings = get_settings()
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Prevent production use of default secret key
    if settings.ENVIRONMENT == "production" and "change-me" in settings.SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be changed for production! Use: openssl rand -hex 32")
    logger.info("database_ready", env=settings.ENVIRONMENT)
    yield
    await engine.dispose()


# Hide docs in production
docs_url = None if settings.ENVIRONMENT == "production" else "/docs"
redoc_url = None if settings.ENVIRONMENT == "production" else "/redoc"

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS + ["*"] if settings.DEBUG else settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = Path(__file__).resolve().parents[1] / "uploads"
upload_dir.mkdir(parents=True, exist_ok=True)
(upload_dir / "products").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.VERSION, "env": settings.ENVIRONMENT}
