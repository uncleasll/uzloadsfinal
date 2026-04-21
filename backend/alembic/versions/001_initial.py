"""Initial migration — create all tables

Revision ID: 001
Revises:
Create Date: 2026-04-12 00:00:00
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── Enums ──────────────────────────────────────────────────────────────────
    load_status = postgresql.ENUM(
        'New', 'Canceled', 'TONU', 'Dispatched', 'En Route', 'Picked-up', 'Delivered', 'Closed',
        name='loadstatus'
    )
    billing_status = postgresql.ENUM(
        'Pending', 'Canceled', 'BOL received', 'Invoiced', 'Sent to factoring', 'Funded', 'Paid',
        name='billingstatus'
    )
    stop_type = postgresql.ENUM('pickup', 'delivery', name='stoptype')
    service_type = postgresql.ENUM('Lumper', 'Detention', 'Other', name='servicetype')
    document_type = postgresql.ENUM('Confirmation', 'BOL', 'Other', name='documenttype')
    settlement_status = postgresql.ENUM('Preparing', 'Ready', 'Sent', 'Paid', 'Void', name='settlementstatus')
    user_role = postgresql.ENUM('admin', 'dispatcher', 'driver', name='userrole')
    driver_doc_type = postgresql.ENUM(
        'application', 'cdl', 'medical_card', 'drug_test', 'mvr',
        'ssn_card', 'employment_verification', 'other',
        name='driverdoctype'
    )

    load_status.create(bind, checkfirst=True)
    billing_status.create(bind, checkfirst=True)
    stop_type.create(bind, checkfirst=True)
    service_type.create(bind, checkfirst=True)
    document_type.create(bind, checkfirst=True)
    settlement_status.create(bind, checkfirst=True)
    user_role.create(bind, checkfirst=True)
    driver_doc_type.create(bind, checkfirst=True)

    # ── drivers ────────────────────────────────────────────────────────────────
    op.create_table(
        'drivers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('license_number', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('driver_type', sa.String(50), nullable=True, server_default='Drv'),
        sa.Column('pay_rate_loaded', sa.Float(), nullable=True, server_default='0.65'),
        sa.Column('pay_rate_empty', sa.Float(), nullable=True, server_default='0.30'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_drivers_id', 'drivers', ['id'])

    # ── trucks ─────────────────────────────────────────────────────────────────
    op.create_table(
        'trucks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('unit_number', sa.String(50), nullable=False),
        sa.Column('make', sa.String(100), nullable=True),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('year', sa.Integer(), nullable=True),
        sa.Column('vin', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('unit_number'),
    )
    op.create_index('ix_trucks_id', 'trucks', ['id'])

    # ── trailers ───────────────────────────────────────────────────────────────
    op.create_table(
        'trailers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('unit_number', sa.String(50), nullable=False),
        sa.Column('trailer_type', sa.String(100), nullable=True),
        sa.Column('length', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('unit_number'),
    )
    op.create_index('ix_trailers_id', 'trailers', ['id'])

    # ── brokers ────────────────────────────────────────────────────────────────
    op.create_table(
        'brokers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('mc_number', sa.String(50), nullable=True),
        sa.Column('dot_number', sa.String(50), nullable=True),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(50), nullable=True),
        sa.Column('zip_code', sa.String(20), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('factoring', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('factoring_company', sa.String(200), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_brokers_id', 'brokers', ['id'])

    # ── dispatchers ────────────────────────────────────────────────────────────
    op.create_table(
        'dispatchers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dispatchers_id', 'dispatchers', ['id'])

    # ── loads ──────────────────────────────────────────────────────────────────
    op.create_table(
        'loads',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('load_number', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            postgresql.ENUM(
                'New', 'Canceled', 'TONU', 'Dispatched', 'En Route', 'Picked-up', 'Delivered', 'Closed',
                name='loadstatus',
                create_type=False,
            ),
            nullable=False,
            server_default='New',
        ),
        sa.Column(
            'billing_status',
            postgresql.ENUM(
                'Pending', 'Canceled', 'BOL received', 'Invoiced', 'Sent to factoring', 'Funded', 'Paid',
                name='billingstatus',
                create_type=False,
            ),
            nullable=False,
            server_default='Pending',
        ),
        sa.Column('load_date', sa.Date(), nullable=False),
        sa.Column('actual_delivery_date', sa.Date(), nullable=True),
        sa.Column('rate', sa.Float(), nullable=True, server_default='0'),
        sa.Column('total_miles', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('loaded_miles', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('empty_miles', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('po_number', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('direct_billing', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('driver_id', sa.Integer(), nullable=True),
        sa.Column('truck_id', sa.Integer(), nullable=True),
        sa.Column('trailer_id', sa.Integer(), nullable=True),
        sa.Column('broker_id', sa.Integer(), nullable=True),
        sa.Column('dispatcher_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['broker_id'], ['brokers.id']),
        sa.ForeignKeyConstraint(['dispatcher_id'], ['dispatchers.id']),
        sa.ForeignKeyConstraint(['driver_id'], ['drivers.id']),
        sa.ForeignKeyConstraint(['trailer_id'], ['trailers.id']),
        sa.ForeignKeyConstraint(['truck_id'], ['trucks.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('load_number'),
    )
    op.create_index('ix_loads_id', 'loads', ['id'])

    # ── load_stops ─────────────────────────────────────────────────────────────
    op.create_table(
        'load_stops',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('load_id', sa.Integer(), nullable=False),
        sa.Column(
            'stop_type',
            postgresql.ENUM('pickup', 'delivery', name='stoptype', create_type=False),
            nullable=False,
        ),
        sa.Column('stop_order', sa.Integer(), nullable=False),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(50), nullable=True),
        sa.Column('zip_code', sa.String(20), nullable=True),
        sa.Column('country', sa.String(50), nullable=True, server_default='US'),
        sa.Column('stop_date', sa.Date(), nullable=True),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['load_id'], ['loads.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_load_stops_id', 'load_stops', ['id'])

    # ── load_services ──────────────────────────────────────────────────────────
    op.create_table(
        'load_services',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('load_id', sa.Integer(), nullable=False),
        sa.Column(
            'service_type',
            postgresql.ENUM('Lumper', 'Detention', 'Other', name='servicetype', create_type=False),
            nullable=False,
        ),
        sa.Column('add_deduct', sa.String(10), nullable=True, server_default='Add'),
        sa.Column('invoice_amount', sa.Float(), nullable=True, server_default='0'),
        sa.Column('drivers_payable', sa.Float(), nullable=True, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['load_id'], ['loads.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_load_services_id', 'load_services', ['id'])

    # ── load_documents ─────────────────────────────────────────────────────────
    op.create_table(
        'load_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('load_id', sa.Integer(), nullable=False),
        sa.Column(
            'document_type',
            postgresql.ENUM('Confirmation', 'BOL', 'Other', name='documenttype', create_type=False),
            nullable=False,
        ),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('original_filename', sa.String(500), nullable=True),
        sa.Column('file_path', sa.String(1000), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['load_id'], ['loads.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_load_documents_id', 'load_documents', ['id'])

    # ── load_history ───────────────────────────────────────────────────────────
    op.create_table(
        'load_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('load_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('author', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['load_id'], ['loads.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_load_history_id', 'load_history', ['id'])

    # ── load_notes ─────────────────────────────────────────────────────────────
    op.create_table(
        'load_notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('load_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('author', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['load_id'], ['loads.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_load_notes_id', 'load_notes', ['id'])

    # ── settlements ────────────────────────────────────────────────────────────
    op.create_table(
        'settlements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('settlement_number', sa.Integer(), nullable=False),
        sa.Column('driver_id', sa.Integer(), nullable=False),
        sa.Column('payable_to', sa.String(200), nullable=True),
        sa.Column(
            'status',
            postgresql.ENUM('Preparing', 'Ready', 'Sent', 'Paid', 'Void', name='settlementstatus', create_type=False),
            nullable=True,
            server_default='Preparing',
        ),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('settlement_total', sa.Float(), nullable=True, server_default='0'),
        sa.Column('balance_due', sa.Float(), nullable=True, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['driver_id'], ['drivers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('settlement_number'),
    )
    op.create_index('ix_settlements_id', 'settlements', ['id'])

    # ── settlement_items ───────────────────────────────────────────────────────
    op.create_table(
        'settlement_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), nullable=False),
        sa.Column('load_id', sa.Integer(), nullable=True),
        sa.Column('item_type', sa.String(50), nullable=True, server_default='load'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['load_id'], ['loads.id']),
        sa.ForeignKeyConstraint(['settlement_id'], ['settlements.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_settlement_items_id', 'settlement_items', ['id'])

    # ── settlement_payments ────────────────────────────────────────────────────
    op.create_table(
        'settlement_payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('settlement_id', sa.Integer(), nullable=False),
        sa.Column('payment_number', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['settlement_id'], ['settlements.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_settlement_payments_id', 'settlement_payments', ['id'])

    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('email', sa.String(200), nullable=False),
        sa.Column('hashed_password', sa.String(500), nullable=False),
        sa.Column(
            'role',
            postgresql.ENUM('admin', 'dispatcher', 'driver', name='userrole', create_type=False),
            nullable=False,
            server_default='dispatcher',
        ),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('dispatcher_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['dispatcher_id'], ['dispatchers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_users_id', 'users', ['id'])

    # ── driver_documents ───────────────────────────────────────────────────────
    op.create_table(
        'driver_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('driver_id', sa.Integer(), nullable=False),
        sa.Column(
            'doc_type',
            postgresql.ENUM(
                'application', 'cdl', 'medical_card', 'drug_test', 'mvr',
                'ssn_card', 'employment_verification', 'other',
                name='driverdoctype',
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column('status', sa.String(100), nullable=True),
        sa.Column('number', sa.String(100), nullable=True),
        sa.Column('state', sa.String(10), nullable=True),
        sa.Column('application_date', sa.Date(), nullable=True),
        sa.Column('hire_date', sa.Date(), nullable=True),
        sa.Column('termination_date', sa.Date(), nullable=True),
        sa.Column('issue_date', sa.Date(), nullable=True),
        sa.Column('exp_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('name', sa.String(200), nullable=True),
        sa.Column('filename', sa.String(500), nullable=True),
        sa.Column('original_filename', sa.String(500), nullable=True),
        sa.Column('file_path', sa.String(1000), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['driver_id'], ['drivers.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_driver_documents_id', 'driver_documents', ['id'])


def downgrade() -> None:
    op.drop_table('driver_documents')
    op.drop_table('users')
    op.drop_table('settlement_payments')
    op.drop_table('settlement_items')
    op.drop_table('settlements')
    op.drop_table('load_notes')
    op.drop_table('load_history')
    op.drop_table('load_documents')
    op.drop_table('load_services')
    op.drop_table('load_stops')
    op.drop_table('loads')
    op.drop_table('dispatchers')
    op.drop_table('brokers')
    op.drop_table('trailers')
    op.drop_table('trucks')
    op.drop_table('drivers')

    for enum_name in [
        'driverdoctype',
        'userrole',
        'settlementstatus',
        'documenttype',
        'servicetype',
        'stoptype',
        'billingstatus',
        'loadstatus',
    ]:
        op.execute(f'DROP TYPE IF EXISTS {enum_name}')