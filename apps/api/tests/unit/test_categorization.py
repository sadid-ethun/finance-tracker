"""Rule matching, merchant normalization, and precedence."""

from typing import Any

import pytest

from app.core.errors import ValidationError
from app.models.rule import Rule
from app.models.transaction import Transaction
from app.services.categorization import (
    apply_actions,
    normalize_merchant,
    rule_matches,
    validate_rule,
)


def tx(**kwargs: object) -> Transaction:
    defaults: dict[str, object] = {
        "name": "WHOLE FOODS MARKET",
        "merchant_name": None,
        "notes": None,
        "amount": -5250,
    }
    defaults.update(kwargs)
    return Transaction(**defaults)


def rule(conditions: dict[str, Any], actions: dict[str, Any] | None = None) -> Rule:
    return Rule(
        name="test",
        conditions=conditions,
        actions=actions or {"set_notes": "hit"},
        priority=100,
        is_active=True,
    )


# ------------------------------------------------------------- normalization


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("SQ *BLUE BOTTLE #123 06/14", "BLUE BOTTLE"),
        ("TST* CHIPOTLE 2841", "CHIPOTLE"),
        ("AMAZON.COM*2X4Y5", "AMAZON COM"),
        ("WHOLE FOODS MARKET", "WHOLE FOODS MARKET"),
    ],
)
def test_normalize_strips_processor_noise(raw: str, expected: str) -> None:
    """Store numbers and processor prefixes must not defeat merchant memory."""
    assert normalize_merchant(raw) == expected


def test_normalize_is_stable_across_variants() -> None:
    a = normalize_merchant("SQ *BLUE BOTTLE #123 06/14")
    b = normalize_merchant("SQ *BLUE BOTTLE #987 11/02")
    assert a == b


# --------------------------------------------------------------- rule engine


def test_contains_is_case_insensitive() -> None:
    r = rule({"all": [{"field": "name", "op": "contains", "value": "whole foods"}]})
    assert rule_matches(tx(), r)


def test_all_requires_every_clause() -> None:
    r = rule(
        {
            "all": [
                {"field": "name", "op": "contains", "value": "WHOLE FOODS"},
                {"field": "amount", "op": "lt", "value": -10000},
            ]
        }
    )
    assert not rule_matches(tx(amount=-5250), r)
    assert rule_matches(tx(amount=-20000), r)


def test_any_requires_one_clause() -> None:
    r = rule(
        {
            "any": [
                {"field": "name", "op": "contains", "value": "NOPE"},
                {"field": "amount", "op": "lt", "value": 0},
            ]
        }
    )
    assert rule_matches(tx(), r)


def test_amount_comparisons_use_minor_units() -> None:
    """A rule saying "over $50" is value 5000, not 50."""
    r = rule({"all": [{"field": "amount", "op": "lte", "value": -5000}]})
    assert rule_matches(tx(amount=-5250), r)
    assert not rule_matches(tx(amount=-4999), r)


def test_missing_field_does_not_match() -> None:
    r = rule({"all": [{"field": "notes", "op": "contains", "value": "x"}]})
    assert not rule_matches(tx(notes=None), r)


def test_not_contains() -> None:
    r = rule({"all": [{"field": "name", "op": "not_contains", "value": "TARGET"}]})
    assert rule_matches(tx(), r)


def test_apply_actions_marks_source_as_rule() -> None:
    """Rule-set categories must be distinguishable from manual ones."""
    transaction = tx()
    r = rule(
        {"all": [{"field": "name", "op": "contains", "value": "W"}]},
        {"set_category_id": "018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5061"},
    )
    apply_actions(transaction, r)

    assert transaction.category_source == "rule"


def test_apply_actions_can_exclude_from_budget() -> None:
    transaction = tx()
    apply_actions(transaction, rule({"all": []}, {"exclude_from_budget": True}))
    assert transaction.exclude_from_budget is True


# ---------------------------------------------------------------- validation


def test_rule_needs_conditions() -> None:
    with pytest.raises(ValidationError):
        validate_rule({}, {"set_notes": "x"})


def test_rule_rejects_unknown_field() -> None:
    with pytest.raises(ValidationError):
        validate_rule(
            {"all": [{"field": "secret", "op": "contains", "value": "x"}]},
            {"set_notes": "x"},
        )


def test_rule_rejects_unknown_operator() -> None:
    with pytest.raises(ValidationError):
        validate_rule(
            {"all": [{"field": "name", "op": "regex", "value": "x"}]},
            {"set_notes": "x"},
        )


def test_rule_rejects_non_integer_amount() -> None:
    """Guards against someone writing 50.00 and meaning fifty dollars."""
    with pytest.raises(ValidationError):
        validate_rule(
            {"all": [{"field": "amount", "op": "gt", "value": 50.0}]},
            {"set_notes": "x"},
        )


def test_rule_needs_actions() -> None:
    with pytest.raises(ValidationError):
        validate_rule({"all": [{"field": "name", "op": "contains", "value": "x"}]}, {})
