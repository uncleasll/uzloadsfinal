"""Persist generated payroll independently of settlement selection."""
from alembic import op
import sqlalchemy as sa
revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('scheduled_payroll_occurrences',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('scheduled_transaction_id', sa.Integer(), sa.ForeignKey('driver_scheduled_transactions.id'), nullable=False),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=False),
        sa.Column('payable_to', sa.String(200), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('adj_type', sa.String(20), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint('scheduled_transaction_id', 'date', name='uq_payroll_occurrence_date'))

def downgrade():
    op.drop_table('scheduled_payroll_occurrences')
