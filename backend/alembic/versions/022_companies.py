"""Companies (tenants): every operational table gets company_id; existing data becomes company 1.

Revision ID: 022
Revises: 021
"""
from alembic import op
import sqlalchemy as sa

revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None

SCOPED = ['drivers', 'trucks', 'trailers', 'brokers', 'dispatchers', 'loads', 'users', 'expenses',
          'truck_statements', 'dispatcher_payouts', 'recurring_bills']


def upgrade():
    op.create_table('companies',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('week_start_day', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    bind = op.get_bind()
    op.execute("INSERT INTO companies (id, name) SELECT 1, COALESCE((SELECT name FROM company_settings ORDER BY id LIMIT 1), 'Karvan')")
    if bind.dialect.name == 'postgresql':
        op.execute("SELECT setval(pg_get_serial_sequence('companies', 'id'), 1)")
    for table in SCOPED:
        op.add_column(table, sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, server_default='1'))
        op.create_index(f'ix_{table}_company_id', table, ['company_id'])
    # unit and load numbers are unique per company now; drop the old global uniques by whatever name they have
    insp = sa.inspect(bind)
    for table, column in [('trucks', 'unit_number'), ('trailers', 'unit_number'), ('loads', 'load_number')]:
        for uc in insp.get_unique_constraints(table):
            if uc['column_names'] == [column] and uc['name']:
                op.drop_constraint(uc['name'], table, type_='unique')
        for ix in insp.get_indexes(table):
            if ix.get('unique') and ix['column_names'] == [column] and ix['name']:
                op.drop_index(ix['name'], table_name=table)
    op.create_unique_constraint('uq_truck_unit_per_company', 'trucks', ['company_id', 'unit_number'])
    op.create_unique_constraint('uq_trailer_unit_per_company', 'trailers', ['company_id', 'unit_number'])
    op.create_unique_constraint('uq_load_number_per_company', 'loads', ['company_id', 'load_number'])


def downgrade():
    op.drop_constraint('uq_load_number_per_company', 'loads', type_='unique')
    op.drop_constraint('uq_trailer_unit_per_company', 'trailers', type_='unique')
    op.drop_constraint('uq_truck_unit_per_company', 'trucks', type_='unique')
    for table in SCOPED:
        op.drop_index(f'ix_{table}_company_id', table_name=table)
        op.drop_column(table, 'company_id')
    op.drop_table('companies')
