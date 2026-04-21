"""standalone payments table for advanced payments

Revision ID: 008
Revises: 007
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('payments_new',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('payment_number', sa.Integer(), unique=True, index=True),
        sa.Column('payment_type', sa.String(30), nullable=False),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
        sa.Column('vendor_id', sa.Integer(), sa.ForeignKey('vendors.id'), nullable=True),
        sa.Column('settlement_id', sa.Integer(), sa.ForeignKey('settlements.id'), nullable=True),
        sa.Column('applied_settlement_id', sa.Integer(), sa.ForeignKey('settlements.id'), nullable=True),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('payable_to', sa.String(200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('payments_new')
