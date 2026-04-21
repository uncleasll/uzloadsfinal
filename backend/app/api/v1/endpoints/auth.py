from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.db.session import get_db
from app.models.models import User
from app.services.auth_service import authenticate_user, create_access_token, decode_token, create_user, hash_password

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "dispatcher"
    dispatcher_id: Optional[int] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    return db.query(User).filter(User.id == payload.get("sub")).first()


def require_user(current_user=Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user


def _u(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email,
            "role": u.role.value if hasattr(u.role, "value") else u.role,
            "is_active": u.is_active, "dispatcher_id": u.dispatcher_id}


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": str(user.id), "role": user.role.value if hasattr(user.role, "value") else user.role})
    return {"access_token": token, "token_type": "bearer", "user": _u(user)}


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _u(current_user)


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    return [_u(u) for u in db.query(User).order_by(User.name).all()]


@router.post("/users", status_code=201)
def create_user_ep(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already exists")
    return _u(create_user(db, data.name, data.email, data.password, data.role, data.dispatcher_id))


@router.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u: raise HTTPException(404, "Not found")
    if data.name is not None: u.name = data.name
    if data.email is not None: u.email = data.email
    if data.password is not None: u.hashed_password = hash_password(data.password)
    if data.role is not None: u.role = data.role
    if data.is_active is not None: u.is_active = data.is_active
    db.commit(); db.refresh(u)
    return _u(u)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u: raise HTTPException(404, "Not found")
    u.is_active = False; db.commit()
    return {"message": "Deactivated"}
