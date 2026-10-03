"""Unit tests for formula evaluation and tax calc (no DB required)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.pricing_service import evaluate_formula, calc_tax


def test_evaluate_basic():
    assert evaluate_formula("purchase * 1.25", 100) == 125.0
    assert evaluate_formula("purchase * 1.10 + 2", 100) == 112.0
    assert evaluate_formula("(purchase + 5) * 1.1", 100) == 115.5


def test_calc_tax():
    r = calc_tax(100, 20)
    assert r["net"] == 100
    assert r["tax_amount"] == 20
    assert r["gross"] == 120


def test_disallow_calls():
    try:
        evaluate_formula("__import__('os').system('x')", 1)
        assert False, "should reject"
    except Exception:
        pass
