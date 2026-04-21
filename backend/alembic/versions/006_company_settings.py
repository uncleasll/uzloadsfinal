"""company settings table

Revision ID: 006
Revises: 005
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('company_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=True, server_default='My Company'),
        sa.Column('legal_name', sa.String(200), nullable=True),
        sa.Column('mc_number', sa.String(50), nullable=True),
        sa.Column('dot_number', sa.String(50), nullable=True),
        sa.Column('address', sa.String(300), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(50), nullable=True),
        sa.Column('zip_code', sa.String(20), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('website', sa.String(200), nullable=True),
        sa.Column('logo_path', sa.String(500), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    # Insert default row
    op.execute("INSERT INTO company_settings (name) VALUES ('My Company')")


def downgrade():
    op.drop_table('company_settings')
