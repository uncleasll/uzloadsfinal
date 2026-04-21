"""trucks trailers extended fields and documents

Revision ID: 005
Revises: 004
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to trucks
    with op.batch_alter_table('trucks') as batch_op:
        batch_op.add_column(sa.Column('eld_provider', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('eld_id', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('ownership', sa.String(50), nullable=True, server_default='Owned'))
        batch_op.add_column(sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True))
        batch_op.add_column(sa.Column('plate', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('plate_state', sa.String(10), nullable=True))
        batch_op.add_column(sa.Column('purchase_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('purchase_price', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))

    # Add new columns to trailers
    with op.batch_alter_table('trailers') as batch_op:
        batch_op.add_column(sa.Column('make', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('model', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('year', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('vin', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('ownership', sa.String(50), nullable=True, server_default='Owned'))
        batch_op.add_column(sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True))
        batch_op.add_column(sa.Column('plate', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('plate_state', sa.String(10), nullable=True))
        batch_op.add_column(sa.Column('purchase_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('purchase_price', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))

    # Create truck_documents table
    op.create_table('truck_documents',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=False),
        sa.Column('doc_type', sa.String(100), nullable=False),
        sa.Column('issue_date', sa.Date(), nullable=True),
        sa.Column('exp_date', sa.Date(), nullable=True),
        sa.Column('name', sa.String(200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('original_filename', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Create trailer_documents table
    op.create_table('trailer_documents',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trailer_id', sa.Integer(), sa.ForeignKey('trailers.id'), nullable=False),
        sa.Column('doc_type', sa.String(100), nullable=False),
        sa.Column('issue_date', sa.Date(), nullable=True),
        sa.Column('exp_date', sa.Date(), nullable=True),
        sa.Column('name', sa.String(200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('original_filename', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('trailer_documents')
    op.drop_table('truck_documents')
    with op.batch_alter_table('trailers') as batch_op:
        for col in ['make','model','year','vin','ownership','driver_id','plate','plate_state','purchase_date','purchase_price','notes']:
            batch_op.drop_column(col)
    with op.batch_alter_table('trucks') as batch_op:
        for col in ['eld_provider','eld_id','ownership','driver_id','plate','plate_state','purchase_date','purchase_price','notes']:
            batch_op.drop_column(col)
