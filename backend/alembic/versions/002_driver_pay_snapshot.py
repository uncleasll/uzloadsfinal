"""Add driver compensation snapshot fields to loads

Revision ID: 002
Revises: 001
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    # Add snapshot columns to loads table
    op.add_column('loads', sa.Column('pay_type_snapshot', sa.String(50), nullable=True))
    op.add_column('loads', sa.Column('pay_rate_loaded_snapshot', sa.Float(), nullable=True))
    op.add_column('loads', sa.Column('pay_rate_empty_snapshot', sa.Float(), nullable=True))
    op.add_column('loads', sa.Column('freight_percentage_snapshot', sa.Float(), nullable=True))
    op.add_column('loads', sa.Column('flatpay_snapshot', sa.Float(), nullable=True))
    op.add_column('loads', sa.Column('drivers_payable_snapshot', sa.Float(), nullable=True))
    op.add_column('loads', sa.Column('snapshot_taken_at', sa.DateTime(), nullable=True))
    op.add_column('loads', sa.Column('snapshot_overridden', sa.Boolean(), server_default='false', nullable=False))

    # Back-fill existing loads safely.
    # If driver_profiles exists, use it.
    # If it does not exist, fall back to drivers table only.
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'driver_profiles'
        ) THEN
            UPDATE loads l
            SET
                pay_type_snapshot           = dp.pay_type,
                pay_rate_loaded_snapshot    = COALESCE(dp.pay_rate_loaded, d.pay_rate_loaded, 0.65),
                pay_rate_empty_snapshot     = COALESCE(dp.pay_rate_empty, d.pay_rate_empty, 0.30),
                freight_percentage_snapshot = COALESCE(dp.freight_percentage, 0.0),
                flatpay_snapshot            = COALESCE(dp.flatpay, 0.0),
                snapshot_taken_at           = NOW()
            FROM drivers d
            LEFT JOIN driver_profiles dp ON dp.driver_id = d.id
            WHERE l.driver_id = d.id;
        ELSE
            UPDATE loads l
            SET
                pay_rate_loaded_snapshot    = COALESCE(d.pay_rate_loaded, 0.65),
                pay_rate_empty_snapshot     = COALESCE(d.pay_rate_empty, 0.30),
                freight_percentage_snapshot = 0.0,
                flatpay_snapshot            = 0.0,
                snapshot_taken_at           = NOW()
            FROM drivers d
            WHERE l.driver_id = d.id;
        END IF;
    END
    $$;
    """)


def downgrade():
    op.drop_column('loads', 'snapshot_overridden')
    op.drop_column('loads', 'snapshot_taken_at')
    op.drop_column('loads', 'drivers_payable_snapshot')
    op.drop_column('loads', 'flatpay_snapshot')
    op.drop_column('loads', 'freight_percentage_snapshot')
    op.drop_column('loads', 'pay_rate_empty_snapshot')
    op.drop_column('loads', 'pay_rate_loaded_snapshot')
    op.drop_column('loads', 'pay_type_snapshot')