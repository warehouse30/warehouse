"""Seed initial data for development."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.warehouse import Warehouse
from app.models.category import Category
from app.models.product import Product
from app.models.stock import Stock
from app.models.pricing import TaxRate, PriceList, CategoryPriceFormula, FormulaTemplate
from app.models.proposal import ProposalTemplate
from app.models.currency import Currency
from datetime import datetime, timezone
from app.services.proposal_render import DEFAULT_HTML
from decimal import Decimal


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:

        # Currencies — USD default base
        r = await db.execute(select(Currency).where(Currency.code == "USD"))
        if not r.scalar_one_or_none():
            now = datetime.now(timezone.utc)
            db.add_all([
                Currency(code="USD", name="US Dollar", symbol="$", rate=1, is_default=True, is_active=True, rate_updated_at=now),
                Currency(code="EUR", name="Euro", symbol="€", rate=1.08, is_default=False, is_active=True, rate_updated_at=now),
                Currency(code="TRY", name="Turkish Lira", symbol="₺", rate=0.029, is_default=False, is_active=True, rate_updated_at=now),
                Currency(code="GBP", name="British Pound", symbol="£", rate=1.27, is_default=False, is_active=True, rate_updated_at=now),
            ])
            await db.flush()

        r = await db.execute(select(User).where(User.email == "admin@warehouse.local"))
        if not r.scalar_one_or_none():
            db.add(User(
                email="admin@warehouse.local",
                full_name="System Admin",
                hashed_password=get_password_hash("admin123"),
                role=UserRole.ADMIN,
            ))
            db.add(User(
                email="worker@warehouse.local",
                full_name="Warehouse Worker",
                hashed_password=get_password_hash("worker123"),
                role=UserRole.WORKER,
            ))
            print("Created users: admin@warehouse.local / admin123")

        r = await db.execute(select(Warehouse).where(Warehouse.code == "WH-A"))
        if not r.scalar_one_or_none():
            wh_a = Warehouse(code="WH-A", name="Main Warehouse A", address="Industrial Zone 1")
            wh_b = Warehouse(code="WH-B", name="Secondary Warehouse B", address="Industrial Zone 2")
            db.add_all([wh_a, wh_b])
            await db.flush()
            print("Created warehouses WH-A, WH-B")
        else:
            r = await db.execute(select(Warehouse).where(Warehouse.code == "WH-A"))
            wh_a = r.scalar_one()

        r = await db.execute(select(Category).where(Category.name == "Electronics"))
        if not r.scalar_one_or_none():
            cats = [
                Category(name="Electronics"),
                Category(name="Hardware"),
                Category(name="Consumables"),
            ]
            db.add_all(cats)
            await db.flush()
            print("Created categories")
        else:
            r = await db.execute(select(Category))
            cats = list(r.scalars().all())

        r = await db.execute(select(Product).limit(1))
        if not r.scalar_one_or_none():
            products = [
                Product(sku="ELEC-001", barcode="8901001001001", name="USB-C Cable 1m", category_id=cats[0].id, unit="pcs", min_stock=Decimal("20")),
                Product(sku="ELEC-002", barcode="8901001001002", name="Wireless Mouse", category_id=cats[0].id, unit="pcs", min_stock=Decimal("10")),
                Product(sku="HW-001", barcode="8901002001001", name="M6 Hex Bolt 20mm", category_id=cats[1].id, unit="box", min_stock=Decimal("5")),
                Product(sku="HW-002", barcode="8901002001002", name="Cable Ties 100pcs", category_id=cats[1].id, unit="pack", min_stock=Decimal("15")),
                Product(sku="CON-001", barcode="8901003001001", name="Packing Tape 48mm", category_id=cats[2].id, unit="roll", min_stock=Decimal("30")),
            ]
            db.add_all(products)
            await db.flush()
            for p in products:
                db.add(Stock(warehouse_id=wh_a.id, product_id=p.id, quantity=Decimal("100")))
            print("Created sample products + stock")


        # Tax rates
        r = await db.execute(select(TaxRate).limit(1))
        if not r.scalar_one_or_none():
            taxes = [
                TaxRate(code="KDV0", name="KDV %0", rate=Decimal("0")),
                TaxRate(code="KDV10", name="KDV %10", rate=Decimal("10")),
                TaxRate(code="KDV20", name="KDV %20", rate=Decimal("20")),
            ]
            db.add_all(taxes)
            await db.flush()
            print("Created tax rates")
        else:
            taxes = list((await db.execute(select(TaxRate))).scalars().all())


        # Formula templates
        r = await db.execute(select(FormulaTemplate).limit(1))
        if not r.scalar_one_or_none():
            kdv20 = next((x for x in (taxes or []) if float(x.rate) == 20), (taxes or [None])[-1] if taxes else None)
            templates = [
                FormulaTemplate(code="STD25", name="Standard +25%", formula="purchase * 1.25", default_sales_tax_id=kdv20.id if kdv20 else None, description="Retail markup 25%"),
                FormulaTemplate(code="SILVER30", name="Silver +30%", formula="purchase * 1.30", default_sales_tax_id=kdv20.id if kdv20 else None),
                FormulaTemplate(code="GOLD40", name="Gold +40%", formula="purchase * 1.40", default_sales_tax_id=kdv20.id if kdv20 else None),
                FormulaTemplate(code="DIST10", name="Dağıtıcı +10%+2", formula="purchase * 1.10 + 2", default_sales_tax_id=kdv20.id if kdv20 else None, description="Distributor pricing"),
            ]
            db.add_all(templates)
            await db.flush()
            print("Created formula templates")

        # Price lists
        r = await db.execute(select(PriceList).limit(1))
        if not r.scalar_one_or_none():
            lists = [
                PriceList(code="PERKANDE", name="Perkande", sort_order=1),
                PriceList(code="SILVER", name="Silver", sort_order=2),
                PriceList(code="GOLD", name="Gold", is_default=True, sort_order=3),
                PriceList(code="DAGITICI", name="Dağıtıcı", sort_order=4),
            ]
            db.add_all(lists)
            await db.flush()
            print("Created price lists")
            # Sample formulas for first category
            if cats:
                kdv20 = next((x for x in taxes if float(x.rate) == 20), taxes[-1])
                formulas = [
                    CategoryPriceFormula(category_id=cats[0].id, price_list_id=lists[0].id, formula="purchase * 1.15", sales_tax_id=kdv20.id),
                    CategoryPriceFormula(category_id=cats[0].id, price_list_id=lists[1].id, formula="purchase * 1.25", sales_tax_id=kdv20.id),
                    CategoryPriceFormula(category_id=cats[0].id, price_list_id=lists[2].id, formula="purchase * 1.40", sales_tax_id=kdv20.id),
                    CategoryPriceFormula(category_id=cats[0].id, price_list_id=lists[3].id, formula="purchase * 1.10 + 2", sales_tax_id=kdv20.id),
                ]
                db.add_all(formulas)
                print("Created sample category formulas")

        # Default proposal template
        r = await db.execute(select(ProposalTemplate).limit(1))
        if not r.scalar_one_or_none():
            db.add(ProposalTemplate(
                code="DEFAULT",
                name="Standard proposal",
                description="Flexible Jinja2 HTML template",
                body_html=DEFAULT_HTML,
                is_default=True,
            ))
            print("Created default proposal template")

        await db.commit()
        print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
