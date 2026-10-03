from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from app.core.deps import DbSession, CurrentUser
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.user import User, UserRole
from app.schemas.user import UserCreate

router = APIRouter()


def _user_dict(user: User) -> dict:
    try:
        role = user.role.value
    except Exception:
        role = str(user.role)
    return {
        "id": int(user.id),
        "email": user.email,
        "full_name": user.full_name or user.email,
        "role": role,
        "is_active": bool(user.is_active),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/register", status_code=201)
async def register(data: UserCreate, db: DbSession):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=get_password_hash(data.password),
        role=data.role if getattr(data, "role", None) else UserRole.WORKER,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return _user_dict(user)


@router.post("/login")
async def login(db: DbSession, form_data: OAuth2PasswordRequestForm = Depends()):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    try:
        role = user.role.value
    except Exception:
        role = str(user.role)
    token = create_access_token(subject=str(user.id), extra_claims={"role": role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_dict(user),
    }


@router.get("/me")
async def me(user: CurrentUser):
    """Never use response_model here — avoids Pydantic/Enum 500s on SQLite."""
    return _user_dict(user)
