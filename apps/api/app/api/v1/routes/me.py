from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.deps import CurrentUser

router = APIRouter(tags=["me"])


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    # Plain str, not EmailStr: this describes what is already stored. Validating
    # on the way out means a row that predates a stricter rule would turn a read
    # into a 500. Email format is enforced where it is accepted, not returned.
    email: str
    name: str
    image: str | None
    created_at: datetime


@router.get("/me", response_model=MeResponse)
async def read_me(user: CurrentUser) -> MeResponse:
    """The authenticated user. Also the smoke test for the whole auth chain."""
    return MeResponse.model_validate(user)
