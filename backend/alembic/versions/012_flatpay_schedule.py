"""Persist flatpay scheduling independently from hire dates and stop rates."""
from alembic import op
import sqlalchemy as sa
revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('driver_profiles', sa.Column('flatpay_period', sa.String(20), nullable=True))
    op.add_column('driver_profiles', sa.Column('flatpay_start_date', sa.Date(), nullable=True))
    op.add_column('driver_scheduled_transactions', sa.Column('source_key', sa.String(100), nullable=True))
    op.create_unique_constraint('uq_driver_schedule_source', 'driver_scheduled_transactions', ['source_key'])

def downgrade():
    op.drop_constraint('uq_driver_schedule_source', 'driver_scheduled_transactions', type_='unique')
    op.drop_column('driver_scheduled_transactions', 'source_key')
    op.drop_column('driver_profiles', 'flatpay_start_date')
    op.drop_column('driver_profiles', 'flatpay_period')
