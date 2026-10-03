import io
import base64
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from app.models.slip import Slip
from app.core.logging import get_logger

logger = get_logger(__name__)


def generate_a4_pdf(slip: Slip, items_detail: list[dict]) -> bytes:
    """Official A4 PDF for admin / customer sign-off."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    c.setFont("Helvetica-Bold", 16)
    c.drawString(30, height - 40, "WAREHOUSE GATE PASS / SLIP")
    c.setFont("Helvetica", 10)
    c.drawString(30, height - 60, f"Slip No: {slip.slip_number}")
    c.drawString(30, height - 75, f"Type: {slip.slip_type.value.upper()}  |  Status: {slip.status.value}")
    c.drawString(30, height - 90, f"Date: {slip.created_at.strftime('%Y-%m-%d %H:%M')}")
    if slip.customer_name:
        c.drawString(30, height - 105, f"Customer: {slip.customer_name}")
    if slip.vehicle_number:
        c.drawString(30, height - 120, f"Vehicle: {slip.vehicle_number}")
    if slip.notes:
        c.drawString(30, height - 135, f"Notes: {slip.notes[:60]}")

    if slip.qr_image_b64:
        try:
            img_data = base64.b64decode(slip.qr_image_b64)
            img = ImageReader(io.BytesIO(img_data))
            c.drawImage(img, width - 120, height - 140, width=90, height=90)
        except Exception:
            pass

    y = height - 170
    c.setFont("Helvetica-Bold", 10)
    c.drawString(30, y, "SKU")
    c.drawString(150, y, "Product")
    c.drawString(380, y, "Qty")
    c.drawString(450, y, "Unit")
    y -= 5
    c.line(30, y, width - 30, y)
    y -= 18

    c.setFont("Helvetica", 9)
    for item in items_detail:
        if y < 80:
            c.showPage()
            y = height - 50
        c.drawString(30, y, str(item.get("sku", ""))[:20])
        c.drawString(150, y, str(item.get("name", ""))[:40])
        c.drawString(380, y, str(item.get("quantity", "")))
        c.drawString(450, y, str(item.get("unit", "pcs")))
        y -= 16

    y = 60
    c.line(30, y + 20, 200, y + 20)
    c.drawString(30, y, "Authorized Signature")
    c.line(width - 200, y + 20, width - 30, y + 20)
    c.drawString(width - 200, y, "Receiver Signature")

    c.save()
    buffer.seek(0)
    return buffer.read()


def generate_thermal_escpos(slip: Slip, items_detail: list[dict]) -> str:
    """Plain-text / ESC-POS friendly body for 80mm thermal printers."""
    lines = []
    lines.append("=" * 32)
    lines.append("   WAREHOUSE GATE PASS")
    lines.append("=" * 32)
    lines.append(f"No: {slip.slip_number}")
    lines.append(f"Type: {slip.slip_type.value.upper()}")
    lines.append(f"Status: {slip.status.value}")
    lines.append(f"Date: {slip.created_at.strftime('%Y-%m-%d %H:%M')}")
    if slip.customer_name:
        lines.append(f"Customer: {slip.customer_name}")
    if slip.vehicle_number:
        lines.append(f"Vehicle: {slip.vehicle_number}")
    if slip.notes:
        lines.append(f"Notes: {slip.notes[:28]}")
    lines.append("-" * 32)
    lines.append(f"{'SKU':<14}{'QTY':>8}")
    lines.append("-" * 32)
    for item in items_detail:
        sku = str(item.get("sku", ""))[:14]
        qty = str(item.get("quantity", ""))
        lines.append(f"{sku:<14}{qty:>8}")
        name = str(item.get("name", ""))[:30]
        if name:
            lines.append(f"  {name}")
    lines.append("-" * 32)
    lines.append(f"Items: {len(items_detail)}")
    lines.append("")
    lines.append("Scan QR on slip for verify")
    lines.append("")
    lines.append("Auth: _______________")
    lines.append("Recv: _______________")
    lines.append("=" * 32)
    lines.append("\n\n\n")
    return "\n".join(lines)


def generate_thermal_html(slip: Slip, items_detail: list[dict]) -> str:
    """Browser-printable 80mm receipt HTML (use window.print)."""
    rows = ""
    for item in items_detail:
        rows += f"""
        <tr>
          <td style="padding:2px 0;font-size:11px;">{item.get('sku','')}</td>
          <td style="padding:2px 0;font-size:11px;text-align:right;">{item.get('quantity','')}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0 0 4px 0;font-size:10px;color:#444;">{item.get('name','')}</td>
        </tr>"""

    qr_img = ""
    if slip.qr_image_b64:
        qr_img = f'<img src="data:image/png;base64,{slip.qr_image_b64}" width="120" height="120" style="display:block;margin:8px auto;" />'

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>{slip.slip_number}</title>
  <style>
    @page {{ size: 80mm auto; margin: 4mm; }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      font-family: 'Courier New', monospace;
      width: 72mm;
      margin: 0 auto;
      padding: 4mm;
      color: #000;
      font-size: 12px;
    }}
    h1 {{ font-size: 14px; text-align: center; margin-bottom: 6px; }}
    .meta {{ font-size: 11px; line-height: 1.4; margin-bottom: 8px; }}
    hr {{ border: none; border-top: 1px dashed #000; margin: 6px 0; }}
    table {{ width: 100%; border-collapse: collapse; }}
    .sig {{ margin-top: 12px; font-size: 11px; }}
    .sig div {{ margin-top: 16px; border-top: 1px solid #000; width: 60%; padding-top: 2px; }}
    @media print {{
      body {{ width: 72mm; }}
      .no-print {{ display: none !important; }}
    }}
  </style>
</head>
<body>
  <h1>WAREHOUSE GATE PASS</h1>
  <hr/>
  <div class="meta">
    <div><strong>No:</strong> {slip.slip_number}</div>
    <div><strong>Type:</strong> {slip.slip_type.value.upper()} &nbsp; <strong>Status:</strong> {slip.status.value}</div>
    <div><strong>Date:</strong> {slip.created_at.strftime('%Y-%m-%d %H:%M')}</div>
    {f'<div><strong>Customer:</strong> {slip.customer_name}</div>' if slip.customer_name else ''}
    {f'<div><strong>Vehicle:</strong> {slip.vehicle_number}</div>' if slip.vehicle_number else ''}
  </div>
  <hr/>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;font-size:11px;">SKU</th>
        <th style="text-align:right;font-size:11px;">QTY</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
  <hr/>
  <div style="font-size:11px;">Items: {len(items_detail)}</div>
  {qr_img}
  <div class="sig">
    <div>Authorized</div>
    <div>Receiver</div>
  </div>
  <script>
    window.onload = function() {{
      setTimeout(function() {{ window.print(); }}, 300);
    }};
  </script>
</body>
</html>"""
