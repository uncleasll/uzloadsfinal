from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Serve uploaded files (driver documents, load documents, etc.)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

@app.on_event("startup")
def startup_fix_snapshots():
    """Calculate missing driver pay snapshots for existing loads on startup."""
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
