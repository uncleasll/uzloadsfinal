"""Match payable extra-stop counting and freeze its compensation rate."""
from alembic import op
import sqlalchemy as sa
revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("ALTER TYPE stoptype ADD VALUE IF NOT EXISTS 'other'")
    op.add_column('load_stops', sa.Column('is_payable', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('load_stops', sa.Column('title', sa.String(200), nullable=True))
    op.add_column('loads', sa.Column('extra_stop_rate_snapshot', sa.Float(), nullable=True))
    op.add_column('loads', sa.Column('extra_stop_count_snapshot', sa.Integer(), nullable=True))

def downgrade():
    op.drop_column('loads', 'extra_stop_count_snapshot')
    op.drop_column('loads', 'extra_stop_rate_snapshot')
    op.drop_column('load_stops', 'title')
    op.drop_column('load_stops', 'is_payable')
    # PostgreSQL enum values are additive; retain 'other' to preserve stop records.
