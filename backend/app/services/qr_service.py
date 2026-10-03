import base64
import hashlib
import hmac
import io
import json
from datetime import datetime, timezone
from typing import Optional
import httpx
import qrcode
from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)


def _local_signed_payload(slip_number: str, warehouse_id: int, extra: dict | None = None) -> str:
    """Deterministic signed token used as QR fallback / primary offline token."""
    payload = {
        "sn": slip_number,
        "wh": warehouse_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        **(extra or {}),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    sig = hmac.new(
        settings.SECRET_KEY.encode(),
        raw.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    return f"{raw}|{sig}"


def generate_qr_image_b64(data: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


async def get_qr_for_slip(
    slip_number: str,
    warehouse_id: int,
    extra: dict | None = None,
) -> tuple[str, str]:
    """
    Returns (payload, image_b64).
    Local signed QR is primary; optional external API if configured.
    """
    local_payload = _local_signed_payload(slip_number, warehouse_id, extra)

    if settings.EXTERNAL_QR_API_URL:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                headers = {}
                if settings.EXTERNAL_QR_API_KEY:
                    headers["Authorization"] = f"Bearer {settings.EXTERNAL_QR_API_KEY}"
                resp = await client.post(
                    settings.EXTERNAL_QR_API_URL,
                    json={"data": local_payload, "slip_number": slip_number},
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    payload = data.get("payload", local_payload)
                    image_b64 = data.get("image_b64")
                    if image_b64:
                        logger.info("qr_external_success", slip=slip_number)
                        return payload, image_b64
        except Exception as e:
            logger.warning("qr_external_failed", error=str(e), slip=slip_number)

    # Fallback
    if settings.QR_FALLBACK_ENABLED:
        logger.info("qr_fallback_used", slip=slip_number)
        return local_payload, generate_qr_image_b64(local_payload)

    raise RuntimeError("QR generation failed and fallback disabled")
