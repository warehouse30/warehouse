"""Pure logic checks for reservation math (mirrors slip_service rules)."""


def apply_confirm(on_hand: float, reserved: float, qty: float):
    """Simulate OUT confirm: release min(reserved, qty), then deduct on_hand."""
    if on_hand < qty:
        raise ValueError("insufficient")
    release = min(reserved, qty)
    reserved2 = reserved - release
    on_hand2 = on_hand - qty
    return on_hand2, reserved2


def apply_cancel(reserved: float, qty: float):
    return max(0.0, reserved - qty)


def test_confirm_with_full_reservation():
    oh, rs = apply_confirm(10, 3, 3)
    assert oh == 7 and rs == 0


def test_confirm_partial_reservation():
    oh, rs = apply_confirm(10, 1, 3)
    assert oh == 7 and rs == 0


def test_cancel_releases():
    assert apply_cancel(5, 2) == 3
    assert apply_cancel(1, 5) == 0
