"""What the link token asks an institution for.

`products` is a hard requirement: Plaid refuses to link any institution that
cannot satisfy every entry. `additional_consented_products` grants consent
without requiring it. Confusing the two is not a subtle failure — putting
`investments` in `products` makes a credit card unlinkable, with Link showing
"None of your accounts are investment accounts."
"""

import inspect

from app.config import Settings
from app.services.plaid import link


def test_investments_is_consented_but_never_required() -> None:
    settings = Settings(environment="test")

    assert "investments" not in settings.plaid_products
    assert "investments" in settings.plaid_additional_consented_products


def test_required_products_stay_minimal() -> None:
    """Anything added here has to be supported by every institution linked."""
    settings = Settings(environment="test")

    assert settings.plaid_products == ["transactions"]


def test_link_token_sends_consented_products_separately() -> None:
    source = inspect.getsource(link.create_link_token)

    assert 'kwargs["products"] = [Products(p) for p in settings.plaid_products]' in source
    assert 'kwargs["additional_consented_products"]' in source


def test_update_mode_requests_no_products() -> None:
    """Re-authenticating an existing item must not re-negotiate products.

    The access token identifies the item; sending products in update mode can
    fail the flow outright.
    """
    source = inspect.getsource(link.create_link_token)
    before_else = source.split("else:")[0]

    assert 'kwargs["access_token"]' in before_else
    assert 'kwargs["products"]' not in before_else


def test_history_window_is_requested_at_link_time() -> None:
    """Plaid defaults transactions.days_requested to 90 when it is not sent.

    The setting existed and was wired to nothing, so every item was linked
    with a quarter of the history the config advertised — invisible, because
    90 days of transactions still looks like a working app.
    """
    source = inspect.getsource(link.create_link_token)

    assert "LinkTokenTransactions(" in source
    assert "days_requested=settings.plaid_initial_backfill_days" in source


def test_the_window_stays_within_plaids_ceiling() -> None:
    """730 days is Plaid's maximum; asking for more is an error, not more data."""
    settings = Settings(environment="test")

    assert 0 < settings.plaid_initial_backfill_days <= 730
