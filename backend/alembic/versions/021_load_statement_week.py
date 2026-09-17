"""Explicit statement week on loads (which Saturday–Friday block a load is filed in).

Revision ID: 021
Revises: 020
"""
from alembic import op
import sqlalchemy as sa

revision = '021'
down_revision = '020'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('loads', sa.Column('statement_week', sa.Date(), nullable=True))
    op.create_index('ix_loads_statement_week', 'loads', ['statement_week'])


def downgrade():
    op.drop_index('ix_loads_statement_week', table_name='loads')
    op.drop_column('loads', 'statement_week')
