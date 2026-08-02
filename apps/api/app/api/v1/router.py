from fastapi import APIRouter

from app.api.v1.routes import accounts, categories, health, me, rules, transactions

# Feature routers are registered here as each phase lands.
api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(me.router)
api_router.include_router(accounts.router)
api_router.include_router(categories.router)
api_router.include_router(transactions.router)
api_router.include_router(rules.router)
