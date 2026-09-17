"""Weekly truck statements: truck deduction templates, driver pay rules, generated statements.

Revision ID: 019
Revises: 018
"""
from alembic import op
import sqlalchemy as sa

revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('trucks', sa.Column('fee_pct', sa.Float(), nullable=True, server_default='0'))
    op.add_column('trucks', sa.Column('carry_negative', sa.Boolean(), nullable=True, server_default=sa.true()))
    op.add_column('drivers', sa.Column('pay_type', sa.String(20), nullable=True, server_default='percent'))
    op.add_column('drivers', sa.Column('pay_pct', sa.Float(), nullable=True, server_default='30'))
    op.add_column('drivers', sa.Column('per_mile_rate', sa.Float(), nullable=True, server_default='0.55'))

    op.create_table('truck_deductions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=False),
        sa.Column('label', sa.String(120), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('effective_from', sa.Date(), nullable=True),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
    )
    op.create_table('driver_deductions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=False),
        sa.Column('label', sa.String(120), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('effective_from', sa.Date(), nullable=True),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table('truck_statements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=False),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('status', sa.String(10), nullable=False, server_default='draft'),
        sa.Column('fee_pct', sa.Float(), server_default='0'),
        sa.Column('odometer_start', sa.Integer(), nullable=True),
        sa.Column('odometer_end', sa.Integer(), nullable=True),
        sa.Column('carry_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('gross', sa.Float(), server_default='0'),
        sa.Column('fee', sa.Float(), server_default='0'),
        sa.Column('deductions', sa.Float(), server_default='0'),
        sa.Column('driver_pay', sa.Float(), server_default='0'),
        sa.Column('driver_deductions', sa.Float(), server_default='0'),
        sa.Column('driver_payout', sa.Float(), server_default='0'),
        sa.Column('carry_in', sa.Float(), server_default='0'),
        sa.Column('net', sa.Float(), server_default='0'),
        sa.Column('ach_reference', sa.String(100), nullable=True),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('truck_id', 'period_start', name='uq_truck_statement_week'),
    )
    op.create_table('statement_lines',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('statement_id', sa.Integer(), sa.ForeignKey('truck_statements.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('load_id', sa.Integer(), sa.ForeignKey('loads.id'), nullable=True),
        sa.Column('expense_id', sa.Integer(), sa.ForeignKey('expenses.id'), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
    )
    op.create_index('ix_statement_lines_statement', 'statement_lines', ['statement_id'])
    op.create_index('ix_truck_statements_period', 'truck_statements', ['period_start'])


def downgrade():
    op.drop_index('ix_truck_statements_period', table_name='truck_statements')
    op.drop_index('ix_statement_lines_statement', table_name='statement_lines')
    op.drop_table('statement_lines')
    op.drop_table('truck_statements')
    op.drop_table('driver_deductions')
    op.drop_table('truck_deductions')
    op.drop_column('drivers', 'per_mile_rate')
    op.drop_column('drivers', 'pay_pct')
    op.drop_column('drivers', 'pay_type')
    op.drop_column('trucks', 'carry_negative')
    op.drop_column('trucks', 'fee_pct')
