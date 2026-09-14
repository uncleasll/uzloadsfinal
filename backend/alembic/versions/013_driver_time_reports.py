"""Freeze hourly work and link each time report to at most one settlement."""
from alembic import op
import sqlalchemy as sa
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('driver_time_reports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=False),
        sa.Column('payable_to', sa.String(200), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('hours', sa.Float(), nullable=False),
        sa.Column('hourly_rate', sa.Float(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('request_key', sa.String(100), nullable=False, unique=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()))
    op.add_column('settlement_adjustments', sa.Column('time_report_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_adjustment_time_report', 'settlement_adjustments', 'driver_time_reports', ['time_report_id'], ['id'])
    op.create_unique_constraint('uq_adjustment_time_report', 'settlement_adjustments', ['time_report_id'])

def downgrade():
    op.drop_constraint('uq_adjustment_time_report', 'settlement_adjustments', type_='unique')
    op.drop_constraint('fk_adjustment_time_report', 'settlement_adjustments', type_='foreignkey')
    op.drop_column('settlement_adjustments', 'time_report_id')
    op.drop_table('driver_time_reports')
