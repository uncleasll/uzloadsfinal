"""Files stored in the database.

Revision ID: 030
Revises: 029
"""
from alembic import op
import sqlalchemy as sa

revision = '030'
down_revision = '029'
branch_labels = None
depends_on = None


def upgrade():
    if 'file_blobs' not in set(sa.inspect(op.get_bind()).get_table_names()):
        op.create_table('file_blobs',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('key', sa.String(500), nullable=False, unique=True, index=True),
            sa.Column('content_type', sa.String(100), nullable=True),
            sa.Column('size', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('data', sa.LargeBinary(), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )


def downgrade():
    op.drop_table('file_blobs')
