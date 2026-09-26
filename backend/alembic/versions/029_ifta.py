"""Fuel state and gallons on expenses; IFTA miles per state.

Revision ID: 029
Revises: 028
"""
from alembic import op
import sqlalchemy as sa

revision = '029'
down_revision = '028'
branch_labels = None
depends_on = None


def upgrade():
    cols = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('expenses')}
    with op.batch_alter_table('expenses') as b:
        if 'state' not in cols:
            b.add_column(sa.Column('state', sa.String(2), nullable=True))
        if 'gallons' not in cols:
            b.add_column(sa.Column('gallons', sa.Float(), nullable=True))
    if 'ifta_miles' not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table('ifta_miles',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
            sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=False, index=True),
            sa.Column('year', sa.Integer(), nullable=False),
            sa.Column('quarter', sa.Integer(), nullable=False),
            sa.Column('state', sa.String(2), nullable=False),
            sa.Column('miles', sa.Integer(), nullable=False, server_default='0'),
            sa.UniqueConstraint('truck_id', 'year', 'quarter', 'state', name='uq_ifta_miles'),
        )


def downgrade():
    op.drop_table('ifta_miles')
    with op.batch_alter_table('expenses') as b:
        b.drop_column('gallons'); b.drop_column('state')
