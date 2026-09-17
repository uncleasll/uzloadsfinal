"""Maintenance: odometer readings, service intervals, services done.

Revision ID: 023
Revises: 022
"""
from alembic import op
import sqlalchemy as sa

revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('truck_odometer_readings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=False, index=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('reading', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table('service_intervals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('service_type', sa.String(50), nullable=False),
        sa.Column('miles', sa.Integer(), server_default='0'),
        sa.Column('days', sa.Integer(), server_default='0'),
        sa.Column('alert_miles', sa.Integer(), server_default='0'),
        sa.Column('alert_days', sa.Integer(), server_default='0'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.UniqueConstraint('company_id', 'service_type', name='uq_service_interval'),
    )
    op.create_table('truck_services',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=False, index=True),
        sa.Column('service_type', sa.String(50), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('odometer', sa.Integer(), nullable=True),
        sa.Column('cost', sa.Float(), server_default='0'),
        sa.Column('vendor', sa.String(200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('expense_id', sa.Integer(), sa.ForeignKey('expenses.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('truck_services')
    op.drop_table('service_intervals')
    op.drop_table('truck_odometer_readings')
