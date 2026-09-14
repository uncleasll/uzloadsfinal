"""Link advance applications and carryover debt transfers.

Existing amounts are not silently rewritten: a separate reconciliation is needed
for settlements computed before advances were classified as payments.
"""
from alembic import op
import sqlalchemy as sa

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('loads', sa.Column('payable_to_snapshot', sa.String(200), nullable=True))
    op.add_column('settlement_adjustments', sa.Column('advanced_payment_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_adjustment_advance', 'settlement_adjustments', 'advanced_payments', ['advanced_payment_id'], ['id'])
    op.create_table('payroll_carryovers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source_settlement_id', sa.Integer(), sa.ForeignKey('settlements.id'), nullable=False, unique=True),
        sa.Column('target_settlement_id', sa.Integer(), sa.ForeignKey('settlements.id'), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('payroll_carryovers')
    op.drop_constraint('fk_adjustment_advance', 'settlement_adjustments', type_='foreignkey')
    op.drop_column('settlement_adjustments', 'advanced_payment_id')
    op.drop_column('loads', 'payable_to_snapshot')
