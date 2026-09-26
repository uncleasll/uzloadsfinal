"""Truck status (in shop, out of service) and dated driver assignments.

Revision ID: 027
Revises: 026
"""
from alembic import op
import sqlalchemy as sa

revision = '027'
down_revision = '026'
branch_labels = None
depends_on = None


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    cols = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('trucks')}
    with op.batch_alter_table('trucks') as b:
        if 'status' not in cols:
            b.add_column(sa.Column('status', sa.String(20), nullable=False, server_default='active'))
        if 'status_note' not in cols:
            b.add_column(sa.Column('status_note', sa.Text(), nullable=True))
        if 'status_since' not in cols:
            b.add_column(sa.Column('status_since', sa.DateTime(), nullable=True))
    if 'driver_assignments' not in existing:
        op.create_table('driver_assignments',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
            sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=False, index=True),
            sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=False, index=True),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=True),
            sa.Column('reason', sa.String(200), nullable=True),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )


def downgrade():
    op.drop_table('driver_assignments')
    with op.batch_alter_table('trucks') as b:
        b.drop_column('status_since'); b.drop_column('status_note'); b.drop_column('status')
