"""projects.content_profile (ваниль/DLC профиль)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-19

Простое аддитивное ADD COLUMN NOT NULL DEFAULT 'base' — в отличие от
owner_id (0002), здесь нет проблемы существующих данных без значения:
server_default гарантирует, что уже существующие строки получат 'base' в
той же миграции, без отдельного backfill-шага. Оба диалекта (SQLite,
Postgres) поддерживают это напрямую, batch_alter_table не нужен.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("content_profile", sa.String(), nullable=False, server_default="base"),
    )


def downgrade() -> None:
    op.drop_column("projects", "content_profile")
