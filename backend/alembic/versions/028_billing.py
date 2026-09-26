"""Invoices per company with a factoring flow; company billing defaults.

Revision ID: 028
Revises: 027
"""
from alembic import op
import sqlalchemy as sa

revision = '028'
down_revision = '027'
branch_labels = None
depends_on = None


def _cols(table):
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    inv = _cols('invoices')
    with op.batch_alter_table('invoices') as b:
        for name, col in [
            ('company_id', sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True)),
            ('channel', sa.Column('channel', sa.String(20), nullable=True)),
            ('sent_at', sa.Column('sent_at', sa.Date(), nullable=True)),
            ('funded_at', sa.Column('funded_at', sa.Date(), nullable=True)),
            ('paid_at', sa.Column('paid_at', sa.Date(), nullable=True)),
            ('fee_pct', sa.Column('fee_pct', sa.Float(), nullable=True)),
            ('fee_amount', sa.Column('fee_amount', sa.Float(), nullable=True)),
            ('advance_pct', sa.Column('advance_pct', sa.Float(), nullable=True)),
            ('advance_amount', sa.Column('advance_amount', sa.Float(), nullable=True)),
            ('paid_amount', sa.Column('paid_amount', sa.Float(), nullable=True)),
        ]:
            if name not in inv:
                b.add_column(col)
    # invoices belong to the company of their load
    op.execute("UPDATE invoices SET company_id = (SELECT company_id FROM loads WHERE loads.id = invoices.load_id) WHERE company_id IS NULL")
    comp = _cols('companies')
    with op.batch_alter_table('companies') as b:
        for name, col in [
            ('payment_terms_days', sa.Column('payment_terms_days', sa.Integer(), nullable=True, server_default='30')),
            ('factoring_company', sa.Column('factoring_company', sa.String(200), nullable=True)),
            ('factoring_fee_pct', sa.Column('factoring_fee_pct', sa.Float(), nullable=True, server_default='3')),
            ('factoring_advance_pct', sa.Column('factoring_advance_pct', sa.Float(), nullable=True, server_default='90')),
        ]:
            if name not in comp:
                b.add_column(col)


def downgrade():
    pass
