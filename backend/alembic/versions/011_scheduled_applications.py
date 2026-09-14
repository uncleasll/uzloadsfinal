"""Identify each scheduled payroll application by its source and due date."""
from alembic import op
import sqlalchemy as sa
revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('settlement_adjustments', sa.Column('scheduled_transaction_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_adjustment_schedule', 'settlement_adjustments', 'driver_scheduled_transactions', ['scheduled_transaction_id'], ['id'])
    op.create_unique_constraint('uq_scheduled_application_date', 'settlement_adjustments', ['scheduled_transaction_id', 'date'])

def downgrade():
    op.drop_constraint('uq_scheduled_application_date', 'settlement_adjustments', type_='unique')
    op.drop_constraint('fk_adjustment_schedule', 'settlement_adjustments', type_='foreignkey')
    op.drop_column('settlement_adjustments', 'scheduled_transaction_id')
