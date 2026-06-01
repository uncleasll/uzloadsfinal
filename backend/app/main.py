from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response
import os
import traceback

from app.core.config import settings
from app.db.session import engine
from app.models import models
from app.api.v1 import api_router

models.Base.metadata.create_all(bind=engine)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="uzLoads TMS API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

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
        from app.models.models import Load
        from app.services.driver_pay_service import take_snapshot
        db = SessionLocal()
        loads = db.query(Load).filter(
            Load.driver_id.isnot(None),
            Load.is_active == True,
            Load.drivers_payable_snapshot.is_(None)
        ).all()
        if loads:
            for load in loads:
                try:
                    take_snapshot(db, load)
                except Exception:
                    pass
            db.commit()
        db.close()
    except Exception:
        pass


@app.get("/health")
def health():
    return {"status": "ok", "service": "uzLoads TMS API", "version": "1.0.0"}
