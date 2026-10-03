from fastapi import APIRouter, HTTPException, Response, Query
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from app.core.deps import DbSession, CurrentUser
from app.models.slip import Slip, SlipStatus, SlipItem
from app.models.warehouse import Warehouse
from app.schemas.slip import SlipCreate, SlipOut, SlipItemOut
from app.services.slip_service import create_slip, confirm_slip, cancel_slip
from app.services.print_service import generate_a4_pdf, generate_thermal_escpos, generate_thermal_html
from app.services.hikvision_service import on_slip_print
from app.models.audit import AuditLog
import json

router = APIRouter()


def _slip_to_out(slip: Slip) -> SlipOut:
    items = [
        SlipItemOut(
            id=it.id,
            product_id=it.product_id,
            quantity=it.quantity,
            notes=it.notes,
            product_sku=it.product.sku if it.product else None,
            product_name=it.product.name if it.product else None,
        )
        for it in slip.items
    ]
    return SlipOut(
        id=slip.id,
        slip_number=slip.slip_number,
        slip_type=slip.slip_type,
        status=slip.status,
        warehouse_id=slip.warehouse_id,
        created_by=slip.created_by,
        customer_name=slip.customer_name,
        vehicle_number=slip.vehicle_number,
        notes=slip.notes,
        qr_payload=slip.qr_payload,
        qr_image_b64=slip.qr_image_b64,
        created_at=slip.created_at,
        confirmed_at=slip.confirmed_at,
        items=items,
        warehouse_code=slip.warehouse.code if slip.warehouse else None,
        created_by_name=slip.created_by_user.full_name if slip.created_by_user else None,
    )


async def _load_slip(db, slip_id: int) -> Slip | None:
    result = await db.execute(
        select(Slip)
        .options(
            selectinload(Slip.items).selectinload(SlipItem.product),
            selectinload(Slip.warehouse),
            selectinload(Slip.created_by_user),
        )
        .where(Slip.id == slip_id)
    )
    return result.scalar_one_or_none()


def _item_details(slip: Slip) -> list[dict]:
    return [
        {
            "sku": it.product.sku if it.product else "",
            "name": it.product.name if it.product else "",
            "quantity": float(it.quantity),
            "unit": it.product.unit if it.product else "pcs",
        }
        for it in slip.items
    ]


async def _mark_printed_and_open_gate(db, slip: Slip, user_id: int, fmt: str) -> dict:
    if slip.status in (SlipStatus.CONFIRMED, SlipStatus.PRINTED, SlipStatus.DRAFT):
        slip.status = SlipStatus.PRINTED
    gate_result = {}
    # Load warehouse with gate config
    r = await db.execute(select(Warehouse).where(Warehouse.id == slip.warehouse_id))
    wh = r.scalar_one_or_none()
    if wh:
        gate_result = await on_slip_print(wh, slip.slip_number, open_gate=True)
    db.add(AuditLog(
        user_id=user_id,
        action="slip_print",
        entity_type="slip",
        entity_id=slip.id,
        details=json.dumps({"slip_number": slip.slip_number, "format": fmt, "gate": gate_result}),
    ))
    await db.flush()
    return gate_result


@router.get("", response_model=list[SlipOut])
async def list_slips(db: DbSession, user: CurrentUser, limit: int = Query(20, ge=1, le=100)):
    result = await db.execute(
        select(Slip)
        .options(
            selectinload(Slip.items).selectinload(SlipItem.product),
            selectinload(Slip.warehouse),
            selectinload(Slip.created_by_user),
        )
        .order_by(desc(Slip.id))
        .limit(limit)
    )
    return [_slip_to_out(s) for s in result.scalars().all()]


@router.post("", response_model=SlipOut, status_code=201)
async def create(data: SlipCreate, db: DbSession, user: CurrentUser):
    slip = await create_slip(db, data, user.id)
    slip = await _load_slip(db, slip.id)
    return _slip_to_out(slip)


@router.get("/verify/{slip_number}")
async def verify_slip(slip_number: str, db: DbSession, user: CurrentUser):
    """Gate role: scan QR / enter slip number — show items, mark exited if confirmed."""
    result = await db.execute(
        select(Slip)
        .options(
            selectinload(Slip.items).selectinload(SlipItem.product),
            selectinload(Slip.warehouse),
        )
        .where(Slip.slip_number == slip_number)
    )
    slip = result.scalar_one_or_none()
    if not slip:
        # try match by qr_payload containing slip number
        result = await db.execute(
            select(Slip)
            .options(
                selectinload(Slip.items).selectinload(SlipItem.product),
                selectinload(Slip.warehouse),
            )
            .where(Slip.qr_payload.contains(slip_number))
            .order_by(desc(Slip.id))
            .limit(1)
        )
        slip = result.scalar_one_or_none()
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    return {
        "valid": True,
        "slip": _slip_to_out(slip),
        "can_exit": slip.status in (SlipStatus.CONFIRMED, SlipStatus.PRINTED),
    }


@router.post("/verify/{slip_number}/exit")
async def mark_exit(slip_number: str, db: DbSession, user: CurrentUser):
    result = await db.execute(select(Slip).where(Slip.slip_number == slip_number))
    slip = result.scalar_one_or_none()
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    db.add(AuditLog(
        user_id=user.id,
        action="gate_exit",
        entity_type="slip",
        entity_id=slip.id,
        details=json.dumps({"slip_number": slip.slip_number}),
    ))
    await db.flush()
    return {"ok": True, "slip_number": slip.slip_number, "message": "Exit recorded"}


@router.get("/{slip_id}", response_model=SlipOut)
async def get_slip(slip_id: int, db: DbSession, user: CurrentUser):
    slip = await _load_slip(db, slip_id)
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    return _slip_to_out(slip)


@router.post("/{slip_id}/confirm", response_model=SlipOut)
async def confirm(slip_id: int, db: DbSession, user: CurrentUser):
    await confirm_slip(db, slip_id, user.id)
    slip = await _load_slip(db, slip_id)
    return _slip_to_out(slip)


@router.post("/{slip_id}/cancel", response_model=SlipOut)
async def cancel(slip_id: int, db: DbSession, user: CurrentUser):
    await cancel_slip(db, slip_id, user.id)
    slip = await _load_slip(db, slip_id)
    return _slip_to_out(slip)


@router.get("/{slip_id}/print/pdf")
async def print_pdf(slip_id: int, db: DbSession, user: CurrentUser):
    slip = await _load_slip(db, slip_id)
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    pdf_bytes = generate_a4_pdf(slip, _item_details(slip))
    gate = await _mark_printed_and_open_gate(db, slip, user.id, "pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{slip.slip_number}.pdf"',
            "X-Gate-Result": json.dumps(gate)[:500],
        },
    )


@router.get("/{slip_id}/print/thermal")
async def print_thermal(slip_id: int, db: DbSession, user: CurrentUser):
    slip = await _load_slip(db, slip_id)
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    text = generate_thermal_escpos(slip, _item_details(slip))
    await _mark_printed_and_open_gate(db, slip, user.id, "thermal")
    return Response(
        content=text,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slip.slip_number}.txt"'},
    )


@router.get("/{slip_id}/print/thermal-html")
async def print_thermal_html(slip_id: int, db: DbSession, user: CurrentUser):
    slip = await _load_slip(db, slip_id)
    if not slip:
        raise HTTPException(status_code=404, detail="Slip not found")
    html = generate_thermal_html(slip, _item_details(slip))
    await _mark_printed_and_open_gate(db, slip, user.id, "thermal-html")
    return Response(content=html, media_type="text/html; charset=utf-8")
