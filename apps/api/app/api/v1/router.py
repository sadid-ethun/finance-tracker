from fastapi import APIRouter

from app.api.v1.routes import (
    accounts,
    budgets,
    cash_flow,
    categories,
    dashboard,
    data,
    health,
    investments,
    me,
    plaid,
    rules,
    transactions,
)

# Feature routers are registered here as each phase lands.
api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(dashboard.router)
api_router.include_router(me.router)
api_router.include_router(accounts.router)
api_router.include_router(categories.router)
api_router.include_router(budgets.router)
api_router.include_router(investments.router)
api_router.include_router(cash_flow.router)
api_router.include_router(data.router)
api_router.include_router(transactions.router)
api_router.include_router(rules.router)
api_router.include_router(plaid.router)
