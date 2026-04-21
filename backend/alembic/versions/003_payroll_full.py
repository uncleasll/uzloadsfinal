"""Full payroll module - settlement adjustments, history, open balance tracking

Revision ID: 003
Revises: 002
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # ── Settlement adjustments (additions / deductions) ──────────────────────
    op.create_table('settlement_adjustments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), sa.ForeignKey('settlements.id'), nullable=False),
        sa.Column('adj_type', sa.String(20), nullable=False),   # 'addition' | 'deduction'
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_settlement_adjustments_id', 'settlement_adjustments', ['id'])
    op.create_index('ix_settlement_adjustments_settlement_id', 'settlement_adjustments', ['settlement_id'])

    # ── Settlement history / audit log ────────────────────────────────────────
    op.create_table('settlement_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), sa.ForeignKey('settlements.id'), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('author', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_settlement_history_id', 'settlement_history', ['id'])
    op.create_index('ix_settlement_history_settlement_id', 'settlement_history', ['settlement_id'])

    # ── Email logs ────────────────────────────────────────────────────────────
    op.create_table('settlement_email_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), sa.ForeignKey('settlements.id'), nullable=False),
        sa.Column('to_email', sa.String(500), nullable=True),
        sa.Column('cc_email', sa.String(500), nullable=True),
        sa.Column('subject', sa.String(500), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('sent_by', sa.String(200), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_settlement_email_logs_id', 'settlement_email_logs', ['id'])

    # ── Add load_id + load snapshot to settlement_items ──────────────────────
    op.add_column('settlement_items',
        sa.Column('load_date', sa.Date(), nullable=True))
    op.add_column('settlement_items',
        sa.Column('load_status', sa.String(50), nullable=True))
    op.add_column('settlement_items',
        sa.Column('load_billing_status', sa.String(50), nullable=True))
    op.add_column('settlement_items',
        sa.Column('load_pickup_city', sa.String(100), nullable=True))
    op.add_column('settlement_items',
        sa.Column('load_delivery_city', sa.String(100), nullable=True))
    op.add_column('settlement_items',
        sa.Column('amount_snapshot', sa.Float(), nullable=True))

    # ── QB export state on settlements ───────────────────────────────────────
    op.add_column('settlements',
        sa.Column('qb_exported', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('settlements',
        sa.Column('qb_exported_at', sa.DateTime(), nullable=True))

    # ── Payment date field on settlement_payments ─────────────────────────────
    op.add_column('settlement_payments',
        sa.Column('payment_date', sa.Date(), nullable=True))
    op.add_column('settlement_payments',
        sa.Column('is_carryover', sa.Boolean(), server_default='false', nullable=False))

    # ── Status for "Ready for payment" (existing READY maps to it) ───────────
    # The existing enum already has READY — we just add READY_FOR_PAYMENT as alias display
    # We keep model as-is, just add display label in frontend


def downgrade():
    op.drop_table('settlement_email_logs')
    op.drop_table('settlement_history')
    op.drop_table('settlement_adjustments')
    op.drop_column('settlement_items', 'load_date')
    op.drop_column('settlement_items', 'load_status')
    op.drop_column('settlement_items', 'load_billing_status')
    op.drop_column('settlement_items', 'load_pickup_city')
    op.drop_column('settlement_items', 'load_delivery_city')
    op.drop_column('settlement_items', 'amount_snapshot')
    op.drop_column('settlements', 'qb_exported')
    op.drop_column('settlements', 'qb_exported_at')
    op.drop_column('settlement_payments', 'payment_date')
    op.drop_column('settlement_payments', 'is_carryover')
