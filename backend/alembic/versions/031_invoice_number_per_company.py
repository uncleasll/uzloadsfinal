"""Invoice numbers are unique per company, not across the whole database.

Revision ID: 031
Revises: 030
"""
from alembic import op
import sqlalchemy as sa

revision = '031'
down_revision = '030'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    uniques = {u['name'] for u in insp.get_unique_constraints('invoices')}
    indexes = {i['name']: i for i in insp.get_indexes('invoices')}
    with op.batch_alter_table('invoices') as b:
        if 'ix_invoices_invoice_number' in indexes and indexes['ix_invoices_invoice_number'].get('unique'):
            b.drop_index('ix_invoices_invoice_number')
            b.create_index('ix_invoices_invoice_number', ['invoice_number'], unique=False)
        for name in ('invoices_invoice_number_key', 'uq_invoices_invoice_number'):
            if name in uniques:
                b.drop_constraint(name, type_='unique')
        if 'uq_invoice_number_per_company' not in uniques:
            b.create_unique_constraint('uq_invoice_number_per_company', ['company_id', 'invoice_number'])


def downgrade():
    with op.batch_alter_table('invoices') as b:
        b.drop_constraint('uq_invoice_number_per_company', type_='unique')
        b.drop_index('ix_invoices_invoice_number')
        b.create_index('ix_invoices_invoice_number', ['invoice_number'], unique=True)
