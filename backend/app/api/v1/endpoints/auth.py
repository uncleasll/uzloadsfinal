"""Sign-up, sign-in, and the company's team: users, roles and invitations."""
from __future__ import annotations
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.tenant import company_scope
from app.db.session import get_db
from app.models.models import OFFICE_ROLES, Company, Dispatcher, Driver, Invitation, User
from app.services.auth_service import authenticate_user, create_access_token, decode_token, hash_password

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

ROLES = ("admin", "accountant", "dispatcher", "driver")
INVITE_DAYS = 7
LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS = 8, 60
_attempts: dict[str, deque] = defaultdict(deque)


# ── Dependencies ─────────────────────────────────────────────────────────────

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    return user if user and user.is_active else None


def require_user(current_user=Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user


def require_admin(current_user=Depends(require_user)):
    if _role(current_user) != "admin":
        raise HTTPException(status_code=403, detail="Only the owner can manage the team")
    return current_user


def _role(u: User) -> str:
    return u.role.value if hasattr(u.role, "value") else u.role


def _u(u: User, db: Session | None = None) -> dict:
    company = db.get(Company, u.company_id) if db and u.company_id else None
    return {"id": u.id, "name": u.name, "email": u.email, "phone": u.phone, "role": _role(u), "is_active": u.is_active,
            "dispatcher_id": u.dispatcher_id, "driver_id": u.driver_id,
            "company_id": u.company_id, "company_name": company.name if company else None,
            "last_login": u.last_login.isoformat() if u.last_login else None}


def _token(user: User) -> str:
    # Drivers stay signed in on their phones for a month; office sessions last a week.
    days = 30 if _role(user) == "driver" else 7
    return create_access_token({"sub": str(user.id), "role": _role(user), "company_id": user.company_id}, minutes=days * 24 * 60)


def _throttle(key: str):
    """At most LOGIN_ATTEMPTS failed sign-ins per key per minute."""
    now = time.time()
    q = _attempts[key]
    while q and now - q[0] > LOGIN_WINDOW_SECONDS:
        q.popleft()
    if len(q) >= LOGIN_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Wait a minute and try again.")


# ── Sign-up and sign-in ──────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    company_name: str
    name: str
    email: str
    password: str


@router.post("/register", status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """A new trucking company signs up: creates the company and its owner."""
    if not data.company_name.strip() or not data.name.strip():
        raise HTTPException(400, "Company name and your name are required")
    if len(data.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    email = data.email.strip().lower()
    with company_scope(None):
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(400, "Email already exists")
        company = Company(name=data.company_name.strip())
        db.add(company)
        db.flush()
        user = User(name=data.name.strip(), email=email, hashed_password=hash_password(data.password),
                    role="admin", is_active=True, company_id=company.id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return {"access_token": _token(user), "token_type": "bearer", "user": _u(user, db)}


@router.post("/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form.username.strip().lower()
    key = f"{request.client.host if request.client else '-'}|{email}"
    _throttle(key)
    with company_scope(None):
        user = authenticate_user(db, email, form.password)
        if not user:
            _attempts[key].append(time.time())
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if not user.company_id:
            raise HTTPException(status_code=403, detail="This account is not attached to a company. Ask the owner for an invitation.")
        user.last_login = datetime.utcnow()
        db.commit()
    _attempts.pop(key, None)
    return {"access_token": _token(user), "token_type": "bearer", "user": _u(user, db)}


@router.post("/demo")
def demo_login(role: str = "admin", db: Session = Depends(get_db)):
    """Public: open the sandbox company as owner, dispatcher or driver. Nothing here is real."""
    from app.services.demo import ensure_demo
    if role not in ("admin", "dispatcher", "driver"):
        raise HTTPException(400, "Unknown role")
    users = ensure_demo(db)
    user = users[role]
    return {"access_token": _token(user), "token_type": "bearer", "user": _u(user, db), "demo": True}


@router.get("/me")
def me(current_user=Depends(require_user), db: Session = Depends(get_db)):
    return _u(current_user, db)


# ── Team ─────────────────────────────────────────────────────────────────────

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    driver_id: Optional[int] = None
    dispatcher_id: Optional[int] = None
    password: Optional[str] = None


@router.get("/users")
def list_users(db: Session = Depends(get_db), _=Depends(require_user)):
    return [_u(u) for u in db.query(User).order_by(User.name).all()]


@router.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db), me_=Depends(require_admin)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "Not found")
    if data.role is not None and data.role not in ROLES:
        raise HTTPException(400, "Unknown role")
    if u.id == me_.id and (data.is_active is False or (data.role and data.role != "admin")):
        raise HTTPException(400, "You cannot lock yourself out")
    for k in ("name", "phone", "role", "is_active", "driver_id", "dispatcher_id"):
        v = getattr(data, k)
        if v is not None or k in data.model_fields_set:
            setattr(u, k, v)
    if data.password:
        if len(data.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        u.hashed_password = hash_password(data.password)
    db.commit(); db.refresh(u)
    return _u(u)


@router.delete("/users/{user_id}")
def deactivate_user(user_id: int, db: Session = Depends(get_db), me_=Depends(require_admin)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "Not found")
    if u.id == me_.id:
        raise HTTPException(400, "You cannot deactivate yourself")
    u.is_active = False; db.commit()
    return {"message": "Deactivated"}


# ── Invitations ──────────────────────────────────────────────────────────────

class InviteIn(BaseModel):
    name: str
    email: str
    role: str
    driver_id: Optional[int] = None
    dispatcher_id: Optional[int] = None


def _inv(i: Invitation) -> dict:
    return {"id": i.id, "token": i.token, "name": i.name, "email": i.email, "role": i.role,
            "driver_id": i.driver_id, "dispatcher_id": i.dispatcher_id,
            "expires_at": i.expires_at.isoformat(), "accepted_at": i.accepted_at.isoformat() if i.accepted_at else None,
            "expired": i.accepted_at is None and i.expires_at < datetime.utcnow()}


@router.get("/invitations")
def list_invitations(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.query(Invitation).filter(Invitation.accepted_at.is_(None)).order_by(Invitation.created_at.desc()).all()
    return [_inv(i) for i in rows]


@router.post("/invitations", status_code=201)
def create_invitation(data: InviteIn, db: Session = Depends(get_db), me_=Depends(require_admin)):
    if data.role not in ROLES:
        raise HTTPException(400, "Unknown role")
    if not data.name.strip():
        raise HTTPException(400, "Name is required")
    email = data.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "A valid email is required")
    with company_scope(None):
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(400, "This email already has an account")
    if data.role == "driver" and data.driver_id and not db.get(Driver, data.driver_id):
        raise HTTPException(400, "Driver not found")
    if data.role == "dispatcher" and data.dispatcher_id and not db.get(Dispatcher, data.dispatcher_id):
        raise HTTPException(400, "Dispatcher not found")
    # One open invitation per email in this company: replace the old one
    for old in db.query(Invitation).filter(Invitation.email == email, Invitation.accepted_at.is_(None)).all():
        db.delete(old)
    inv = Invitation(token=secrets.token_urlsafe(32), name=data.name.strip(), email=email, role=data.role,
                     driver_id=data.driver_id if data.role == "driver" else None,
                     dispatcher_id=data.dispatcher_id if data.role == "dispatcher" else None,
                     invited_by=me_.id, expires_at=datetime.utcnow() + timedelta(days=INVITE_DAYS))
    db.add(inv); db.commit(); db.refresh(inv)
    return _inv(inv)


@router.delete("/invitations/{invitation_id}")
def revoke_invitation(invitation_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    inv = db.get(Invitation, invitation_id)
    if not inv:
        raise HTTPException(404, "Not found")
    db.delete(inv); db.commit()
    return {"message": "Revoked"}


def _open_invitation(db: Session, token: str) -> Invitation:
    with company_scope(None):
        inv = db.query(Invitation).filter(Invitation.token == token).first()
    if not inv or inv.accepted_at:
        raise HTTPException(404, "This invitation is no longer valid")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(410, "This invitation has expired. Ask the office for a new one.")
    return inv


@router.get("/invitations/{token}/preview")
def preview_invitation(token: str, db: Session = Depends(get_db)):
    """Public: what the invited person sees before setting a password."""
    inv = _open_invitation(db, token)
    with company_scope(None):
        company = db.get(Company, inv.company_id)
    return {"name": inv.name, "email": inv.email, "role": inv.role, "company_name": company.name if company else ""}


class AcceptIn(BaseModel):
    password: str
    phone: Optional[str] = None


@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, data: AcceptIn, db: Session = Depends(get_db)):
    """Public: the invited person sets a password and is signed in."""
    if len(data.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    inv = _open_invitation(db, token)
    with company_scope(None):
        if db.query(User).filter(User.email == inv.email).first():
            raise HTTPException(400, "This email already has an account")
        user = User(name=inv.name, email=inv.email, phone=data.phone, hashed_password=hash_password(data.password),
                    role=inv.role, is_active=True, company_id=inv.company_id,
                    driver_id=inv.driver_id, dispatcher_id=inv.dispatcher_id)
        db.add(user)
        inv.accepted_at = datetime.utcnow()
        db.commit(); db.refresh(user)
    return {"access_token": _token(user), "token_type": "bearer", "user": _u(user, db)}


def is_office(role: str) -> bool:
    return role in OFFICE_ROLES
