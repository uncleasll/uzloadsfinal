"""Chat and documents: conversations, membership history, messages, attachments.

Revision ID: 025
Revises: 024
"""
from alembic import op
import sqlalchemy as sa

revision = '025'
down_revision = '024'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('conversations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=True, index=True),
        sa.Column('load_id', sa.Integer(), sa.ForeignKey('loads.id'), nullable=True, index=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table('conversation_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversations.id'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('joined_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('left_at', sa.DateTime(), nullable=True),
        sa.Column('last_read_message_id', sa.Integer(), nullable=True),
    )
    op.create_table('messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversations.id'), nullable=False, index=True),
        sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('kind', sa.String(20), nullable=False, server_default='text'),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('client_id', sa.String(64), nullable=True),
        sa.Column('client_created_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), index=True),
        sa.UniqueConstraint('sender_id', 'client_id', name='uq_message_client_id'),
    )
    op.create_table('attachments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True, index=True),
        sa.Column('message_id', sa.Integer(), sa.ForeignKey('messages.id'), nullable=True, index=True),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('truck_id', sa.Integer(), sa.ForeignKey('trucks.id'), nullable=True, index=True),
        sa.Column('load_id', sa.Integer(), sa.ForeignKey('loads.id'), nullable=True, index=True),
        sa.Column('category', sa.String(30), nullable=False, server_default='photo'),
        sa.Column('storage_key', sa.String(500), nullable=False),
        sa.Column('original_filename', sa.String(500), nullable=True),
        sa.Column('content_type', sa.String(100), nullable=True),
        sa.Column('size', sa.Integer(), nullable=True),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('taken_at', sa.DateTime(), nullable=True),
        sa.Column('received_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lng', sa.Float(), nullable=True),
        sa.Column('sha256', sa.String(64), nullable=True),
        sa.Column('stamp', sa.Text(), nullable=True),
    )


def downgrade():
    for t in ('attachments', 'messages', 'conversation_members', 'conversations'):
        op.drop_table(t)
