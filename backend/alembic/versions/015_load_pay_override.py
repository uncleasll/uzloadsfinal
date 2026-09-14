"""Store explicit per-load compensation overrides separately from frozen rates."""
from alembic import op
import sqlalchemy as sa
revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('loads', sa.Column('driver_pay_override', sa.JSON(), nullable=True))

def downgrade():
    op.drop_column('loads', 'driver_pay_override')
