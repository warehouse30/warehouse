# Warehouse Inventory & Gate-Pass System

Full-stack warehouse management system with offline-first mobile scanner, concurrent stock safety, dual-format printing, and bulk import.

## Architecture

```
Frontend (React + Vite + Tailwind CDN + html5-qrcode)
  ├── Offline queue (IndexedDB) + auto-sync
  ├── Optimistic UI + beep/haptic feedback
  └── PWA-ready (manifest)

Backend (FastAPI + SQLAlchemy async)
  ├── JWT RBAC (admin / manager / worker / gate)
  ├── SELECT … FOR UPDATE row-level locking
  ├── Background bulk Excel/CSV import
  ├── Local QR fallback (HMAC-signed)
  ├── A4 PDF + 80mm thermal slip printing
  └── Structured audit logging

Database: SQLite (demo) → switch to PostgreSQL for production
```

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m alembic upgrade head

# Seed demo data
cd ..
PYTHONPATH=backend python scripts/seed.py

# Run API
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs  
Health: http://localhost:8000/health

**Demo accounts**
| Email | Password | Role |
|-------|----------|------|
| admin@warehouse.local | admin123 | admin |
| worker@warehouse.local | worker123 | worker |

### Frontend

```bash
cd frontend
npm install
npm install html5-qrcode react-router-dom axios zustand idb
npm run dev
```

Open http://localhost:5173

## Key Features Implemented

1. **Concurrency** – Stock adjustments use `SELECT … FOR UPDATE` + version column.
2. **Offline-first scanner** – Scans queue in IndexedDB when offline; auto-sync on reconnect.
3. **Audio + haptic** – Beep + vibration on successful barcode read.
4. **Optimistic UI** – Immediate feedback; rollback/queue on error.
5. **Bulk import** – Excel/CSV via BackgroundTasks + job status polling.
6. **Dual print** – A4 PDF (reportlab) + 80mm thermal text (ESC/POS-friendly).
7. **QR fallback** – External API attempt → local HMAC-signed QR.
8. **RBAC** – JWT roles; docs hidden when `ENVIRONMENT=production`.
9. **Reports** – Dynamic inventory filters + full audit trail.
10. **Server-side pagination** – Products, stocks, reports.

## Production Notes

- Set `DATABASE_URL=postgresql+asyncpg://...` and `ENVIRONMENT=production`.
- Use Celery + Redis instead of BackgroundTasks for large imports.
- Put the API behind HTTPS and a reverse proxy.
- Rotate `SECRET_KEY`.
- Add rate limiting on `/stocks/adjust` and scan endpoints.

## Project Layout

```
warehouse-system/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routers
│   │   ├── core/         # config, db, security, deps, logging
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # business logic (stock lock, QR, print, bulk)
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/        # Login, Scanner, Stocks, Slips, Reports, Bulk
│       ├── api.ts
│       └── offlineQueue.ts
├── scripts/seed.py
└── README.md
```

## Sample Barcodes (seed data)

- `8901001001001` – USB-C Cable
- `8901001001002` – Wireless Mouse
- `8901002001001` – M6 Hex Bolt
- `8901003001001` – Packing Tape

## Hikvision DS-K1T510EBWX-E1 gate integration

When creating/editing a **Warehouse**, enable the access controller and set:

| Field | Example |
|-------|---------|
| Host | `192.168.1.64` |
| Port | `80` |
| Username / Password | device admin credentials |
| Door No | `1` |
| Open on print | yes |

On every **slip print** (PDF / thermal / HTML), the backend:

1. Calls ISAPI `PUT /ISAPI/AccessControl/RemoteControl/door/{doorNo}` with `<cmd>open</cmd>` (HTTP Digest auth)
2. Optionally registers a temporary visitor user (employeeNo ≈ slip number)
3. Logs the gate result in the audit trail

Manual actions: **Test** connection and **Open** door from Warehouses page.

## Additional features

- **Cycle count** – snapshot stock, count via barcode, apply variance adjustments
- **Transfer** – `POST /stocks/transfer` between warehouses (ordered locks)
- **Low-stock alerts** – Reports → Alerts + CSV export
- **Idempotent offline scans** – `X-Idempotency-Key` header
- **Gate verify** – scan slip QR at exit, mark exited
- **Bin location** on products
- **Role-scoped warehouses** – `user.warehouse_ids`
- **Dark mode** + service worker shell cache


## New modules (v2)

- **Procurement**: PO → goods receipt (stock in with locking)
- **Proposal → Slip**: reserve stock on convert
- **Product image upload**: `POST /uploads/products/{id}/image`
- **Labels**: `GET /labels/product/{id}.pdf`
- **Price matrix**: `/pricing/price-matrix`
- **Notifications**: bell in header
- **E-invoice stub**: `/einvoice/proposals/{id}/ubl-stub`
- **Gate rate limit**: 10 opens/min + audit log
- **Docker**: `docker compose up` (Postgres + API)
- **Backup**: `scripts/backup.sh`
- **Tests**: `cd backend && python -m pytest tests/ -q` (or run file directly)

Reset DB after pull: `rm -f /tmp/warehouse.db && PYTHONPATH=backend python scripts/seed.py`


## Reservation lifecycle

1. Proposal **→ Slip** creates a **draft** outbound slip and **reserves** quantity.
2. **Confirm** deducts on-hand stock and clears the reservation.
3. **Cancel** releases the reservation without changing on-hand qty.

## RBAC (UI)

Admin/Manager only: Pricing, Bulk, Warehouses, Procurement, Price matrix, Proposal templates.
Workers keep Scanner, Stocks, Transfer, Cycle count, Slips, Gate, Products, Customers, Proposals.

## Exports

- Proposals: PDF, Excel, PNG, **HTML** (full Jinja template), e-invoice JSON stub
- Labels: product PDF
- Audit / inventory CSV
