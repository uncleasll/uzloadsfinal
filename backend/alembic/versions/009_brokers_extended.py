"""Extend brokers table with full customer fields

Adds columns required by the Brokers / Customers UI: second address line,
FID/EIN, free-form notes, explicit "is broker" / "is shipper-receiver" flags,
and credit/billing fields (quickpay fee, credit grade, avg days to pay,
status, pay terms).

Revision ID: 009
Revises: 008
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa


revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('brokers') as batch:
        batch.add_column(sa.Column('address2', sa.String(500), nullable=True))
        batch.add_column(sa.Column('fid_ein',  sa.String(50),  nullable=True))
        batch.add_column(sa.Column('notes',    sa.Text(),      nullable=True))

        batch.add_column(sa.Column('is_broker',           sa.Boolean(), server_default=sa.text('true'),  nullable=False))
        batch.add_column(sa.Column('is_shipper_receiver', sa.Boolean(), server_default=sa.text('false'), nullable=False))

        batch.add_column(sa.Column('quickpay_fee',    sa.Float(),    nullable=True))
        batch.add_column(sa.Column('credit',          sa.String(10), nullable=True))
        batch.add_column(sa.Column('avg_days_to_pay', sa.Integer(),  nullable=True))
        batch.add_column(sa.Column('status',          sa.String(20), server_default='Pending', nullable=False))
        batch.add_column(sa.Column('pay_terms',       sa.String(100), nullable=True))


def downgrade():
    with op.batch_alter_table('brokers') as batch:
        batch.drop_column('pay_terms')
        batch.drop_column('status')
        batch.drop_column('avg_days_to_pay')
        batch.drop_column('credit')
        batch.drop_column('quickpay_fee')
        batch.drop_column('is_shipper_receiver')
        batch.drop_column('is_broker')
        batch.drop_column('notes')
        batch.drop_column('fid_ein')
        batch.drop_column('address2')
