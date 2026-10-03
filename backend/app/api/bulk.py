import uuid
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Form, HTTPException
from app.core.deps import DbSession, CurrentUser, require_roles
from app.models.user import UserRole
from app.services.bulk_service import process_product_import, get_job_status
from fastapi import Depends

router = APIRouter()


@router.post("/import/products")
async def import_products(
    background_tasks: BackgroundTasks,
    db: DbSession,
    user=Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    file: UploadFile = File(...),
    warehouse_id: int | None = Form(None),
):
    """Upload Excel/CSV for bulk product + stock import. Returns job_id for polling."""
    if not file.filename or not (
        file.filename.lower().endswith(".xlsx")
        or file.filename.lower().endswith(".xls")
        or file.filename.lower().endswith(".csv")
    ):
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls or .csv allowed")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20 MB
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    job_id = str(uuid.uuid4())
    background_tasks.add_task(
        process_product_import,
        db,
        content,
        file.filename,
        job_id,
        warehouse_id,
    )
    return {"job_id": job_id, "status": "queued", "message": "Import started. Poll /bulk/jobs/{job_id}"}


@router.get("/jobs/{job_id}")
async def job_status(job_id: str, user: CurrentUser):
    status = get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status
