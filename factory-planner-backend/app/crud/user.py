import uuid
from sqlalchemy.orm import Session
from app.models.user import UserModel
from app.services.user_migration_service import LEGACY_USER_ID


def get_user_by_id(db: Session, user_id: str) -> UserModel | None:
    return db.query(UserModel).filter(UserModel.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> UserModel | None:
    return db.query(UserModel).filter(UserModel.email == email).first()


def get_user_by_username(db: Session, username: str) -> UserModel | None:
    return db.query(UserModel).filter(UserModel.username == username).first()


def create_user(db: Session, email: str, username: str, password_hash: str) -> UserModel:
    user = UserModel(
        id=str(uuid.uuid4()),
        email=email,
        username=username,
        password_hash=password_hash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def count_real_users(db: Session) -> int:
    """Все пользователи, кроме служебного legacy-плейсхолдера (см. user_migration_service.py)."""
    return db.query(UserModel).filter(UserModel.id != LEGACY_USER_ID).count()
