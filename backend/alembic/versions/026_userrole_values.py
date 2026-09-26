"""Make sure the userrole enum has every role the code knows (older databases lack 'accountant').

Revision ID: 026
Revises: 025
"""
from alembic import op

revision = '026'
down_revision = '025'
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == 'postgresql':
        with op.get_context().autocommit_block():
            for value in ('admin', 'dispatcher', 'accountant', 'driver'):
                op.execute(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{value}'")


def downgrade():
    pass
