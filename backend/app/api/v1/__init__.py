from fastapi import APIRouter
from app.api.v1.endpoints import (
    loads, entities, payroll, reports, auth, company,
    drivers_export,
    driver_docs,
    drivers_extended,
    vendors,
    expenses,
    invoices,
    loads_import,
    payments,
    advanced_payments,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(loads.router)
api_router.include_router(loads_import.router)
api_router.include_router(entities.router)
api_router.include_router(payroll.router)
api_router.include_router(reports.router)
api_router.include_router(auth.router)
api_router.include_router(drivers_export.router)
api_router.include_router(driver_docs.router)
api_router.include_router(drivers_extended.router)
api_router.include_router(vendors.router)
api_router.include_router(company.router)
api_router.include_router(expenses.router)
api_router.include_router(invoices.router)
api_router.include_router(payments.router)
api_router.include_router(advanced_payments.router)
