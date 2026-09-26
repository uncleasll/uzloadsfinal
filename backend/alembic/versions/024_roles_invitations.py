"""Driver role, user links to drivers, invitations.

Revision ID: 024
Revises: 023
"""
from alembic import op
import sqlalchemy as sa

revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users') as b:
        b.add_column(sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True))
        b.add_column(sa.Column('phone', sa.String(50), nullable=True))
    # The role column is a native enum on PostgreSQL; add the new value there.
    if op.get_bind().dialect.name == 'postgresql':
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'driver'")
    op.create_table('invitations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('token', sa.String(64), nullable=False, unique=True, index=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('email', sa.String(200), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
        sa.Column('dispatcher_id', sa.Integer(), sa.ForeignKey('dispatchers.id'), nullable=True),
        sa.Column('invited_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('invitations')
    with op.batch_alter_table('users') as b:
        b.drop_column('phone')
        b.drop_column('driver_id')
