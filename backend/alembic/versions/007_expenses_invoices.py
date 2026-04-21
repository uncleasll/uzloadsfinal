"""expenses and invoices tables

Revision ID: 007
Revises: 006
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('expenses',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('expense_date', sa.Date(), nullable=False),
        sa.Column('category', sa.String(100), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('vendor_id', sa.Integer(), sa.ForeignKey('vendors.id'), nullable=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=True),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
        sa.Column('receipt_path', sa.String(500), nullable=True),
        sa.Column('receipt_filename', sa.String(200), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_expenses_date', 'expenses', ['expense_date'])

    op.create_table('invoices',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('invoice_number', sa.Integer(), unique=True, nullable=False, index=True),
        sa.Column('load_id', sa.Integer(), sa.ForeignKey('loads.id'), nullable=False),
        sa.Column('broker_id', sa.Integer(), sa.ForeignKey('brokers.id'), nullable=True),
        sa.Column('invoice_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(50), server_default='Pending'),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('invoices')
    op.drop_index('ix_expenses_date', table_name='expenses')
    op.drop_table('expenses')
