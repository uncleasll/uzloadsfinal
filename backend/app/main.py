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

models.Base.metadata.create_all(bind=engine)
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


@app.middleware("http")
async def tenant_context(request: Request, call_next):
    """Read the bearer token and scope every database query in this request to the user's company."""
    from app.core.tenant import set_company_id, reset_company_id
    from app.services.auth_service import decode_token
    company_id = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        payload = decode_token(auth[7:].strip())
        if payload:
            company_id = payload.get("company_id")
    token = set_company_id(company_id)
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
    except Exception:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers=cors_headers,
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

@app.on_event("startup")
def startup_fix_snapshots():
    try:
        from app.db.session import SessionLocal
        from app.models.models import Load, User
        from app.services.driver_pay_service import take_snapshot
        from app.services.auth_service import hash_password
        db = SessionLocal()

        default_users = [
            ("Asilbek Karimov", "admin@karvan.com", "admin123", "admin"),
            ("Sardor Rahimov", "dispatcher@karvan.com", "disp123", "dispatcher"),
            ("Asilbek Karimov", "asilbekkarimov066@gmail.com", "Asilbek123", "dispatcher"),
            ("Sardor Rahimov", "sardor@silkroad.com", "Sardor123", "dispatcher"),
        ]
        for name, email, password, role in default_users:
            user = db.query(User).filter(User.email == email).first()
            if user:
                # Deploying must preserve existing account passwords and roles.
                continue
            else:
                db.add(
                    User(
                        name=name,
                        email=email,
                        hashed_password=hash_password(password),
                        role=role,
                        is_active=True,
                    )
                )

        # Historical pay must be reconciled explicitly; startup must not assign
        # today's driver rates to old loads that lack a snapshot.
        db.commit()
        db.close()
    except Exception:
        traceback.print_exc()


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
