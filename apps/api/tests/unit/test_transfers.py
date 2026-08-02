"""Transfer pairing.

A missed pair inflates both income and spending; a false pair erases a real
expense. Both directions are pinned here.
"""

from datetime import date
from uuid import uuid4

from app.models.transaction import Transaction
from app.services.transfer_service import find_candidate_pairs

CHECKING = uuid4()
SAVINGS = uuid4()


def tx(amount: int, day: int, account_id: object = CHECKING, **kwargs: object) -> Transaction:
    return Transaction(
        id=uuid4(),
        account_id=account_id,
        amount=amount,
        date=date(2026, 6, day),
        name="Transfer",
        transfer_group_id=kwargs.get("transfer_group_id"),
    )


def test_pairs_opposite_amounts_across_accounts() -> None:
    out = tx(-50000, 10, CHECKING)
    inn = tx(50000, 11, SAVINGS)

    pairs = find_candidate_pairs([out, inn])

    assert len(pairs) == 1
    assert pairs[0] == (out, inn)


def test_does_not_pair_within_one_account() -> None:
    """Two moves inside the same account are not a transfer."""
    pairs = find_candidate_pairs([tx(-50000, 10, CHECKING), tx(50000, 10, CHECKING)])

    assert pairs == []


def test_does_not_pair_outside_the_window() -> None:
    pairs = find_candidate_pairs([tx(-50000, 1, CHECKING), tx(50000, 20, SAVINGS)])

    assert pairs == []


def test_does_not_pair_mismatched_amounts() -> None:
    pairs = find_candidate_pairs([tx(-50000, 10, CHECKING), tx(49000, 11, SAVINGS)])

    assert pairs == []


def test_tolerates_one_cent_difference() -> None:
    pairs = find_candidate_pairs([tx(-50000, 10, CHECKING), tx(50001, 11, SAVINGS)])

    assert len(pairs) == 1


def test_does_not_pair_same_direction() -> None:
    pairs = find_candidate_pairs([tx(-50000, 10, CHECKING), tx(-50000, 11, SAVINGS)])

    assert pairs == []


def test_each_transaction_is_used_at_most_once() -> None:
    """One outflow must not satisfy two inflows."""
    out = tx(-50000, 10, CHECKING)
    in1 = tx(50000, 10, SAVINGS)
    in2 = tx(50000, 11, SAVINGS)

    pairs = find_candidate_pairs([out, in1, in2])

    assert len(pairs) == 1


def test_skips_already_linked_transactions() -> None:
    existing = uuid4()
    out = tx(-50000, 10, CHECKING, transfer_group_id=existing)
    inn = tx(50000, 11, SAVINGS)

    assert find_candidate_pairs([out, inn]) == []


def test_ordinary_expenses_are_not_paired() -> None:
    """A coffee and an unrelated refund must not look like a transfer."""
    coffee = tx(-450, 10, CHECKING)
    salary = tx(320000, 10, SAVINGS)

    assert find_candidate_pairs([coffee, salary]) == []
