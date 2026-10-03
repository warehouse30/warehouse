"""
Hikvision DS-K1T510EBWX-E1 (and compatible) access controller integration via ISAPI.

Primary action on slip print: remote door open.
Optional: register temporary QR credential (employeeNo = slip number).
Uses HTTP Digest authentication as required by Hikvision devices.
"""
from __future__ import annotations

import httpx
from app.models.warehouse import Warehouse
from app.core.logging import get_logger

logger = get_logger(__name__)


class HikvisionError(Exception):
    pass


def _base_url(wh: Warehouse) -> str:
    scheme = "https" if wh.gate_use_https else "http"
    port = wh.gate_port or 80
    return f"{scheme}://{wh.gate_host}:{port}"


async def test_connection(wh: Warehouse) -> dict:
    """GET device info to verify credentials / reachability."""
    if not wh.gate_host or not wh.gate_username:
        raise HikvisionError("Gate host and username required")
    url = f"{_base_url(wh)}/ISAPI/System/deviceInfo"
    async with httpx.AsyncClient(
        auth=httpx.DigestAuth(wh.gate_username, wh.gate_password or ""),
        timeout=5.0,
        verify=False,
    ) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HikvisionError(f"Device responded {resp.status_code}: {resp.text[:200]}")
        return {"ok": True, "status": resp.status_code, "body_preview": resp.text[:300]}


async def remote_open_door(wh: Warehouse) -> dict:
    """
    Open warehouse gate via ISAPI RemoteControl.
    PUT /ISAPI/AccessControl/RemoteControl/door/{doorNo}
    Body: <RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>
    """
    if not wh.gate_enabled:
        return {"skipped": True, "reason": "gate_disabled"}
    if not wh.gate_host:
        return {"skipped": True, "reason": "no_host"}

    door = wh.gate_door_no or 1
    url = f"{_base_url(wh)}/ISAPI/AccessControl/RemoteControl/door/{door}"
    body = "<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>"

    try:
        async with httpx.AsyncClient(
            auth=httpx.DigestAuth(wh.gate_username or "admin", wh.gate_password or ""),
            timeout=5.0,
            verify=False,
        ) as client:
            resp = await client.put(
                url,
                content=body,
                headers={"Content-Type": "application/xml"},
            )
            ok = resp.status_code in (200, 201)
            logger.info(
                "hikvision_remote_open",
                warehouse_id=wh.id,
                host=wh.gate_host,
                door=door,
                status=resp.status_code,
                ok=ok,
            )
            if not ok:
                return {
                    "ok": False,
                    "status_code": resp.status_code,
                    "detail": resp.text[:300],
                }
            return {"ok": True, "status_code": resp.status_code, "door": door}
    except Exception as e:
        logger.warning("hikvision_open_failed", error=str(e), host=wh.gate_host)
        return {"ok": False, "error": str(e)}


async def push_temp_qr_user(wh: Warehouse, employee_no: str, name: str, qr_payload: str) -> dict:
    """
    Optional: create a short-lived user on the terminal so the printed QR
    can also be scanned at the device (if QR auth is enabled on the unit).
    employeeNo is typically the slip number (max ~32 chars).
    """
    if not wh.gate_enabled or not wh.gate_host:
        return {"skipped": True}

    url = f"{_base_url(wh)}/ISAPI/AccessControl/UserInfo/Record?format=json"
    payload = {
        "UserInfo": {
            "employeeNo": employee_no[:32],
            "name": name[:32],
            "userType": "visitor",
            "Valid": {"enable": True, "beginTime": "2000-01-01T00:00:00", "endTime": "2037-12-31T23:59:59"},
            "doorRight": str(wh.gate_door_no or 1),
            "RightPlan": [{"doorNo": wh.gate_door_no or 1, "planTemplateNo": "1"}],
        }
    }
    try:
        async with httpx.AsyncClient(
            auth=httpx.DigestAuth(wh.gate_username or "admin", wh.gate_password or ""),
            timeout=5.0,
            verify=False,
        ) as client:
            resp = await client.post(url, json=payload)
            return {"ok": resp.status_code in (200, 201), "status_code": resp.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def on_slip_print(wh: Warehouse, slip_number: str, open_gate: bool = True) -> dict:
    """Called after slip print: remote-open door + optional temp user."""
    result: dict = {"warehouse_id": wh.id, "slip_number": slip_number}
    if not wh.gate_enabled:
        result["gate"] = {"skipped": True, "reason": "disabled"}
        return result
    if open_gate and wh.gate_open_on_print:
        result["remote_open"] = await remote_open_door(wh)
    result["temp_user"] = await push_temp_qr_user(
        wh, employee_no=slip_number.replace("-", "")[:32], name=f"Slip {slip_number}"[:32], qr_payload=slip_number
    )
    return result
