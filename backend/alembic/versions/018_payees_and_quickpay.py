"""Freeze additional-payee rates and broker quickpay rate."""
from alembic import op
import sqlalchemy as sa
revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('loads', sa.Column('quickpay_rate_snapshot', sa.Float(), nullable=True))
    op.create_table('driver_additional_payees',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=False),
        sa.Column('vendor_id', sa.Integer(), sa.ForeignKey('vendors.id'), nullable=False),
        sa.Column('rate_pct', sa.Float(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint('driver_id', 'vendor_id', name='uq_driver_additional_vendor'))
    op.create_table('load_additional_payees',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('load_id', sa.Integer(), sa.ForeignKey('loads.id'), nullable=False),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=False),
        sa.Column('vendor_id', sa.Integer(), sa.ForeignKey('vendors.id'), nullable=False),
        sa.Column('payable_to', sa.String(200), nullable=False),
        sa.Column('rate_pct', sa.Float(), nullable=False),
        sa.Column('base_amount', sa.Float(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.UniqueConstraint('load_id', 'vendor_id', name='uq_load_additional_vendor'))
    op.add_column('settlement_adjustments', sa.Column('load_payee_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_adjustment_load_payee', 'settlement_adjustments', 'load_additional_payees', ['load_payee_id'], ['id'])
    op.create_unique_constraint('uq_adjustment_load_payee', 'settlement_adjustments', ['load_payee_id'])

def downgrade():
    op.drop_constraint('uq_adjustment_load_payee', 'settlement_adjustments', type_='unique')
    op.drop_constraint('fk_adjustment_load_payee', 'settlement_adjustments', type_='foreignkey')
    op.drop_column('settlement_adjustments', 'load_payee_id')
    op.drop_table('load_additional_payees')
    op.drop_table('driver_additional_payees')
    op.drop_column('loads', 'quickpay_rate_snapshot')
