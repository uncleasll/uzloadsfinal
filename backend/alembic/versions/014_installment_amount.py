"""Keep loan/escrow principal separate from each deduction."""
from alembic import op
import sqlalchemy as sa
revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('driver_scheduled_transactions', sa.Column('deduct_by', sa.Float(), nullable=True))

def downgrade():
    op.drop_column('driver_scheduled_transactions', 'deduct_by')
