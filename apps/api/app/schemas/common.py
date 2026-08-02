from pydantic import BaseModel, Field


class Page[T](BaseModel):
    """Envelope for cursor-paginated collections (PLAN.md section 7)."""

    data: list[T]
    next_cursor: str | None = None
    has_more: bool = False


class Money(BaseModel):
    """Amounts cross the wire as integer minor units plus a currency code.

    Never a float, and never a pre-formatted string: formatting is the client's
    job via Intl.NumberFormat.
    """

    amount: int = Field(description="Integer minor units, e.g. cents.")
    currency: str = Field(min_length=3, max_length=3)
