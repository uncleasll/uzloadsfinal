from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response
import os
import traceback

from app.core.config import settings
from app.db.session import engine
from app.models import models
import app.core.tenant  # noqa: F401  registers the company scoping hooks
from app.api.v1 import api_router

# The schema is owned by Alembic (see render.yaml: `alembic upgrade head` runs before the server).
# Creating tables here raced with migrations and left tables that Alembic then tried to create again.
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="Karvan TMS API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

from app.crud.payroll import PayrollError


@app.exception_handler(PayrollError)
async def handle_payroll_error(request: Request, exc: PayrollError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# What a driver account may reach. Everything else in the API is the office.
DRIVER_PATHS = ("/api/v1/auth/me", "/api/v1/driver/", "/api/v1/chat/", "/api/v1/files/")
# Money and settings belong to the owner and the accountant. Dispatchers work loads, trucks and chat.
DISPATCHER_DENY = ("/api/v1/weeks", "/api/v1/statements", "/api/v1/bills", "/api/v1/dashboard", "/api/v1/expenses", "/api/v1/maintenance",
                   "/api/v1/company", "/api/v1/payroll", "/api/v1/payments", "/api/v1/advanced-payments", "/api/v1/reports", "/api/v1/vendors",
                   "/api/v1/invoices", "/api/v1/auth/invitations", "/api/v1/auth/users/", "/api/v1/billing", "/api/v1/ifta")


def _is_public(path: str) -> bool:
    if path in ("/api/v1/auth/login", "/api/v1/auth/register"):
        return True
    if path.startswith("/api/v1/auth/invitations/") and (path.endswith("/preview") or path.endswith("/accept")):
        return True
    return any(path == p or path.startswith(p) for p in ("/health", "/docs", "/openapi.json", "/redoc", "/uploads/"))


@app.middleware("http")
async def auth_and_tenant(request: Request, call_next):
    """Every API call needs a valid token; the token's company scopes every query in the request."""
    from fastapi.responses import JSONResponse
    from app.core.tenant import set_company_id, reset_company_id
    from app.services.auth_service import decode_token
    path = request.url.path
    payload = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        payload = decode_token(auth[7:].strip())
    if request.method != "OPTIONS" and path.startswith("/api/") and not _is_public(path):
        if not payload or not payload.get("company_id"):
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        if payload.get("role") == "driver" and not any(path.startswith(p) for p in DRIVER_PATHS):
            return JSONResponse({"detail": "Drivers use the driver app"}, status_code=403)
        if payload.get("role") == "dispatcher" and (any(path.startswith(p) for p in DISPATCHER_DENY) or path.endswith("/rules")):
            return JSONResponse({"detail": "This part is for the office"}, status_code=403)
    request.state.role = payload.get("role") if payload else None
    token = set_company_id(payload.get("company_id") if payload else None)
    try:
        return await call_next(request)
    finally:
        reset_company_id(token)


@app.middleware("http")
async def handle_options(request: Request, call_next):
    origin = request.headers.get("origin", "")
    cors_headers = {}
    if origin in settings.cors_origins_list:
        cors_headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }

    if request.method == "OPTIONS":
        return Response(
            status_code=200,
            headers={
                **cors_headers,
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "*",
            }
        )
    try:
        return await call_next(request)
    except Exception as exc:
        traceback.print_exc()
        body = {"detail": "Internal server error"}
        # The owner sees what broke, so a support round-trip through the host's logs is not needed.
        if getattr(request.state, "role", None) == "admin":
            body["error"] = f"{type(exc).__name__}: {str(exc)[:600]}"
        return JSONResponse(status_code=500, content=body, headers=cors_headers)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

@app.get("/health")
def health():
    return {"status": "ok", "service": "Karvan TMS API", "version": "1.0.0"}


@app.on_event('startup')
async def start_payroll_scheduler():
    import asyncio
    from app.services.payroll_scheduler import scheduled_payroll_loop
    app.state.payroll_scheduler = asyncio.create_task(scheduled_payroll_loop())


@app.on_event('shutdown')
async def stop_payroll_scheduler():
    import asyncio
    from contextlib import suppress
    task = getattr(app.state, 'payroll_scheduler', None)
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
