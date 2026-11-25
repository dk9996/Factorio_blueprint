"""initial schema: factories + projects

Revision ID: 0001
Revises:
Create Date: 2026-10-15

Переносимая схема — только String/Integer/JSON/Text/DateTime(timezone=True),
без типов/PRAGMA, специфичных для SQLite (накатывается и на SQLite, и на
Postgres). `factories` описана как есть сейчас (ранее создавалась только
через Base.metadata.create_all, своей миграции не имела) — поведение этой
фичи не меняется, таблица здесь лишь впервые формализована через Alembic.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "factories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("folder", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("icon", sa.String(), nullable=True),
        sa.Column("preview_icons", sa.JSON(), nullable=True),
        sa.Column("entities", sa.JSON(), nullable=True),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("thumbnail", sa.Text(), nullable=True),
        sa.Column("entity_count", sa.Integer(), nullable=True),
        sa.Column("owner_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("projects")
    op.drop_table("factories")
