"""users table + project ownership becomes NOT NULL with FK

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-18

Контекст (см. отчёт по задаче "регистрация/вход пользователей"): в текущей
БД уже реально лежат чертежи разработчика с owner_id IS NULL (созданы до
появления авторизации) — поэтому прямое ALTER COLUMN owner_id NOT NULL
обрушилось бы на существующих данных. Решение: вставляем служебного
"legacy"-пользователя (is_active=False, непригодный хеш пароля — под ним
нельзя залогиниться никогда), переподвешиваем на него все "осиротевшие"
проекты, и только после этого включаем NOT NULL + FK. Дальше, на уровне
приложения (см. app/services/user_migration_service.py), первый РЕАЛЬНЫЙ
зарегистрированный пользователь автоматически получает все проекты
legacy-пользователя — так разработчик не теряет свои чертежи, а колонка
при этом NOT NULL с первого же `alembic upgrade head`.
"""
import hashlib
import os
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Должен буквально совпадать с app/services/user_migration_service.py:LEGACY_USER_ID
LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # Хеш случайных байт — сам по себе ни с одним паролем не совпадёт, но
    # главная гарантия непригодности этого пользователя — is_active=False
    # (проверяется независимо в app/api/deps.py и app/api/auth.py).
    unusable_hash = hashlib.sha256(os.urandom(32)).hexdigest()
    users_table = sa.table(
        "users",
        sa.column("id", sa.String()),
        sa.column("email", sa.String()),
        sa.column("username", sa.String()),
        sa.column("password_hash", sa.String()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        users_table,
        [
            {
                "id": LEGACY_USER_ID,
                "email": "legacy@local.invalid",
                "username": "legacy",
                "password_hash": unusable_hash,
                "is_active": False,
                "created_at": datetime.now(timezone.utc),
            }
        ],
    )

    op.execute(
        sa.text("UPDATE projects SET owner_id = :uid WHERE owner_id IS NULL").bindparams(
            uid=LEGACY_USER_ID
        )
    )

    # batch_alter_table — обязательно для SQLite (ALTER COLUMN/ADD
    # CONSTRAINT напрямую не поддерживаются, Alembic пересобирает таблицу).
    # Именованный constraint — в 0001 таблица создана без именованных
    # constraint'ов вовсе, иначе downgrade на SQLite не найдёт что дропать.
    with op.batch_alter_table("projects") as batch_op:
        batch_op.alter_column("owner_id", existing_type=sa.String(), nullable=False)
        batch_op.create_foreign_key(
            "fk_projects_owner_id_users", "users", ["owner_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_constraint("fk_projects_owner_id_users", type_="foreignkey")
        batch_op.alter_column("owner_id", existing_type=sa.String(), nullable=True)
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
