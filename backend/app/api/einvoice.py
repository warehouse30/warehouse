"""Turkish e-invoice / e-arsiv export stub — structure only, no GIB submission."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DbSession, CurrentUser
from app.models.proposal import Proposal, ProposalItem
from app.services.proposal_render import build_context

router = APIRouter()


@router.get("/proposals/{pid}/ubl-stub")
async def proposal_ubl_stub(pid: int, db: DbSession, user: CurrentUser):
    r = await db.execute(
        select(Proposal)
        .options(
            selectinload(Proposal.items).selectinload(ProposalItem.product),
            selectinload(Proposal.customer),
            selectinload(Proposal.price_list),
        )
        .where(Proposal.id == pid)
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Proposal not found")
    ctx = build_context(p)
    # Minimal UBL-inspired JSON (not full XML) for future GIB mapping
    return {
        "format": "TR-UBL-stub",
        "profile": "EARSIVFATURA",
        "issue_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "document_number": p.number,
        "supplier": {"name": ctx["company"]["name"], "vkn": "0000000000"},
        "customer": {
            "name": ctx["customer"]["name"],
            "tax_id": ctx["customer"]["tax_id"] or "",
            "address": ctx["customer"]["address"] or "",
        },
        "lines": [
            {
                "sku": it["sku"],
                "name": it["name"],
                "quantity": it["quantity"],
                "unit_price": it["unit_price"],
                "tax_percent": it["tax_rate"],
                "line_total": it["line_total"],
            }
            for it in ctx["items"]
        ],
        "totals": ctx["totals"],
        "currency": ctx["proposal"]["currency"],
        "note": "Stub only — not submitted to GİB. Map to UBL-TR XML in a later integration.",
    }
