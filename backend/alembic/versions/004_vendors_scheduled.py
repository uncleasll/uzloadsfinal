"""Vendors and scheduled driver transactions

Revision ID: 004
Revises: 003
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    # ── Vendors ────────────────────────────────────────────────────────────────
    op.create_table(
        'vendors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_name', sa.String(200), nullable=False),
        sa.Column('vendor_type', sa.String(50), nullable=True),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('address2', sa.String(500), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(50), nullable=True),
        sa.Column('zip_code', sa.String(20), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('fid_ein', sa.String(50), nullable=True),
        sa.Column('mc_number', sa.String(50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_equipment_owner', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_additional_payee', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('additional_payee_rate_pct', sa.Float(), nullable=True),
        sa.Column('settlement_template_type', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vendors_id', 'vendors', ['id'])

    # ── Scheduled driver transactions ─────────────────────────────────────────
    op.create_table(
        'driver_scheduled_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=False),
        sa.Column('trans_type', sa.String(20), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('schedule', sa.String(50), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('repeat_type', sa.String(20), nullable=True),
        sa.Column('repeat_times', sa.Integer(), nullable=True),
        sa.Column('times_applied', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_applied', sa.Date(), nullable=True),
        sa.Column('next_due', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('payable_to', sa.String(200), nullable=True),
        sa.Column('settlement_description', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_driver_scheduled_transactions_id', 'driver_scheduled_transactions', ['id'])
    op.create_index('ix_driver_scheduled_transactions_driver_id', 'driver_scheduled_transactions', ['driver_id'])


def downgrade():
    op.drop_index('ix_driver_scheduled_transactions_driver_id', 'driver_scheduled_transactions')
    op.drop_index('ix_driver_scheduled_transactions_id', 'driver_scheduled_transactions')
    op.drop_table('driver_scheduled_transactions')
    op.drop_index('ix_vendors_id', 'vendors')
    op.drop_table('vendors')
