"""update_user_roles_to_pdf_requirements

Revision ID: 3d07f4704c32
Revises: 375ccdedebe8
Create Date: 2026-05-13 16:57:46.971861

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3d07f4704c32'
down_revision: Union[str, Sequence[str], None] = '375ccdedebe8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update old roles to new roles
    op.execute("""
        UPDATE users
        SET role = 'jeweler'
        WHERE role IN ('public_user', 'verified_client', 'nch_employee')
    """)

    # Update role column enum if needed
    op.execute("""
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS users_role_check
    """)

    op.execute("""
        ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('jeweler', 'hallmarking_centre', 'refinery', 'nch_admin'))
    """)


def downgrade() -> None:
    # Revert constraint
    op.execute("""
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS users_role_check
    """)

    op.execute("""
        ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('public_user', 'verified_client', 'nch_employee', 'nch_admin'))
    """)

    # Revert roles back
    op.execute("""
        UPDATE users
        SET role = 'public_user'
        WHERE role IN ('jeweler', 'hallmarking_centre', 'refinery')
    """)
