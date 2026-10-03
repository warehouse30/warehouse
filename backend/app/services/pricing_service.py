"""Safe formula evaluation + purchase tax auto-calc."""
from __future__ import annotations
import ast
import operator
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.product import Product
from app.models.pricing import CategoryPriceFormula, TaxRate

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.USub: operator.neg,
    ast.Pow: operator.pow,
}


def _eval_node(node, names: dict):
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, names)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.Num):
        return float(node.n)
    if isinstance(node, ast.Name):
        if node.id not in names:
            raise ValueError(f"Unknown variable: {node.id}")
        return float(names[node.id])
    if isinstance(node, ast.BinOp):
        op = _OPS.get(type(node.op))
        if not op:
            raise ValueError("Unsupported operator")
        return op(_eval_node(node.left, names), _eval_node(node.right, names))
    if isinstance(node, ast.UnaryOp):
        op = _OPS.get(type(node.op))
        if not op:
            raise ValueError("Unsupported unary operator")
        return op(_eval_node(node.operand, names))
    raise ValueError(f"Unsupported expression: {type(node)}")


def evaluate_formula(formula: str, purchase: float) -> float:
    formula = (formula or "purchase").strip()
    tree = ast.parse(formula, mode="eval")
    for n in ast.walk(tree):
        if isinstance(n, (ast.Call, ast.Attribute, ast.Subscript, ast.List, ast.Dict, ast.JoinedStr)):
            raise ValueError("Disallowed syntax in formula")
    result = _eval_node(tree, {"purchase": float(purchase), "cost": float(purchase)})
    return float(Decimal(str(result)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def calc_tax(amount: float, tax_percent: float) -> dict:
    """Auto-calculate tax amount and totals from net amount + rate %."""
    net = float(amount or 0)
    pct = float(tax_percent or 0)
    tax_amt = float(Decimal(str(net * pct / 100.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))
    gross = float(Decimal(str(net + tax_amt)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))
    return {
        "net": round(net, 4),
        "tax_percent": pct,
        "tax_amount": round(tax_amt, 4),
        "gross": round(gross, 4),
    }


async def get_purchase_breakdown(db: AsyncSession, product: Product) -> dict:
    """Purchase price excl. tax + auto-calculated purchase tax."""
    tax_pct = 0.0
    tax_code = None
    tax_name = None
    tax_id = product.purchase_tax_id
    if tax_id:
        r = await db.execute(select(TaxRate).where(TaxRate.id == tax_id))
        t = r.scalar_one_or_none()
        if t:
            tax_pct = float(t.rate)
            tax_code = t.code
            tax_name = t.name
    breakdown = calc_tax(float(product.purchase_price or 0), tax_pct)
    return {
        "purchase_price": breakdown["net"],
        "purchase_tax_id": tax_id,
        "purchase_tax_code": tax_code,
        "purchase_tax_name": tax_name,
        "purchase_tax_percent": breakdown["tax_percent"],
        "purchase_tax_amount": breakdown["tax_amount"],
        "purchase_price_incl_tax": breakdown["gross"],
    }


async def compute_sales_price(
    db: AsyncSession,
    product: Product,
    price_list_id: int | None,
) -> dict:
    purchase = float(product.purchase_price or 0)
    purchase_info = await get_purchase_breakdown(db, product)

    formula_row = None
    if price_list_id and product.category_id:
        r = await db.execute(
            select(CategoryPriceFormula)
            .options(
                selectinload(CategoryPriceFormula.sales_tax),
                selectinload(CategoryPriceFormula.price_list),
            )
            .where(
                CategoryPriceFormula.category_id == product.category_id,
                CategoryPriceFormula.price_list_id == price_list_id,
                CategoryPriceFormula.is_active == True,
            )
        )
        formula_row = r.scalar_one_or_none()

    if formula_row:
        unit = evaluate_formula(formula_row.formula, purchase)
        tax_pct = float(formula_row.sales_tax.rate) if formula_row.sales_tax else 0.0
        formula_text = formula_row.formula
        list_name = formula_row.price_list.name if formula_row.price_list else None
        sales_tax_id = formula_row.sales_tax_id
    else:
        unit = purchase
        tax_pct = 0.0
        formula_text = None
        list_name = None
        sales_tax_id = None

    sales = calc_tax(unit, tax_pct)
    return {
        "product_id": product.id,
        "sku": product.sku,
        **purchase_info,
        "sales_unit_price": sales["net"],
        "sales_tax_id": sales_tax_id,
        "tax_percent": sales["tax_percent"],
        "tax_amount": sales["tax_amount"],
        "sales_price_incl_tax": sales["gross"],
        "formula": formula_text,
        "price_list": list_name,
        "price_list_id": price_list_id,
    }
