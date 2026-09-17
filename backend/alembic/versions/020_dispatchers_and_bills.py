"""Dispatcher commissions, weekly dispatcher payouts, monthly recurring bills.

Revision ID: 020
Revises: 019
"""
from alembic import op
import sqlalchemy as sa

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('dispatchers', sa.Column('commission_type', sa.String(10), nullable=True, server_default='pct'))
    op.add_column('dispatchers', sa.Column('commission_value', sa.Float(), nullable=True, server_default='0'))
    op.create_table('dispatcher_payouts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('dispatcher_id', sa.Integer(), sa.ForeignKey('dispatchers.id'), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('gross', sa.Float(), server_default='0'),
        sa.Column('amount', sa.Float(), server_default='0'),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.UniqueConstraint('dispatcher_id', 'period_start', name='uq_dispatcher_week'),
    )
    op.create_table('recurring_bills',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('vendor', sa.String(200), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('due_day', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('account', sa.String(100), nullable=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table('bill_payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('bill_id', sa.Integer(), sa.ForeignKey('recurring_bills.id', ondelete='CASCADE'), nullable=False),
        sa.Column('month', sa.String(7), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('paid_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.UniqueConstraint('bill_id', 'month', name='uq_bill_month'),
    )


def downgrade():
    op.drop_table('bill_payments')
    op.drop_table('recurring_bills')
    op.drop_table('dispatcher_payouts')
    op.drop_column('dispatchers', 'commission_value')
    op.drop_column('dispatchers', 'commission_type')
