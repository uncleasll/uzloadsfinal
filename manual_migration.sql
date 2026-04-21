-- uzLoads TMS — Complete Manual Migration
-- Run this against your PostgreSQL database to create all tables
-- Usage: psql -U <user> -d <dbname> -f manual_migration.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE loadstatus AS ENUM ('New','Canceled','TONU','Dispatched','En Route','Picked-up','Delivered','Closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE billingstatus AS ENUM ('Pending','Canceled','BOL received','Invoiced','Sent to factoring','Funded','Paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stoptype AS ENUM ('pickup','delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE servicetype AS ENUM ('Lumper','Detention','Other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE documenttype AS ENUM ('Confirmation','BOL','Other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE settlementstatus AS ENUM ('Preparing','Ready','Sent','Paid','Void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE userrole AS ENUM ('admin','dispatcher','accountant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE driverdoctype AS ENUM ('application','cdl','medical_card','drug_test','mvr','ssn_card','employment_verification','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Core Tables
CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(200),
    license_number VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    driver_type VARCHAR(50) DEFAULT 'Drv',
    pay_rate_loaded FLOAT DEFAULT 0.65,
    pay_rate_empty FLOAT DEFAULT 0.30,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trucks (
    id SERIAL PRIMARY KEY,
    unit_number VARCHAR(50) NOT NULL UNIQUE,
    make VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    vin VARCHAR(100),
    eld_provider VARCHAR(100),
    eld_id VARCHAR(100),
    ownership VARCHAR(50) DEFAULT 'Owned',
    driver_id INTEGER REFERENCES drivers(id),
    plate VARCHAR(50),
    plate_state VARCHAR(10),
    purchase_date DATE,
    purchase_price FLOAT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trailers (
    id SERIAL PRIMARY KEY,
    unit_number VARCHAR(50) NOT NULL UNIQUE,
    trailer_type VARCHAR(100),
    make VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    vin VARCHAR(100),
    ownership VARCHAR(50) DEFAULT 'Owned',
    driver_id INTEGER REFERENCES drivers(id),
    plate VARCHAR(50),
    plate_state VARCHAR(10),
    purchase_date DATE,
    purchase_price FLOAT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS truck_documents (
    id SERIAL PRIMARY KEY,
    truck_id INTEGER NOT NULL REFERENCES trucks(id),
    doc_type VARCHAR(100) NOT NULL,
    issue_date DATE,
    exp_date DATE,
    name VARCHAR(200),
    notes TEXT,
    file_path VARCHAR(500),
    original_filename VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trailer_documents (
    id SERIAL PRIMARY KEY,
    trailer_id INTEGER NOT NULL REFERENCES trailers(id),
    doc_type VARCHAR(100) NOT NULL,
    issue_date DATE,
    exp_date DATE,
    name VARCHAR(200),
    notes TEXT,
    file_path VARCHAR(500),
    original_filename VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_settings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) DEFAULT 'My Company',
    legal_name VARCHAR(200),
    mc_number VARCHAR(50),
    dot_number VARCHAR(50),
    address VARCHAR(300),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(200),
    website VARCHAR(200),
    logo_path VARCHAR(500),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brokers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    mc_number VARCHAR(50),
    dot_number VARCHAR(50),
    address VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(200),
    factoring BOOLEAN DEFAULT FALSE,
    factoring_company VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispatchers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    vendor_type VARCHAR(50),
    address VARCHAR(500),
    address2 VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(200),
    fid_ein VARCHAR(50),
    mc_number VARCHAR(50),
    notes TEXT,
    is_equipment_owner BOOLEAN DEFAULT FALSE,
    is_additional_payee BOOLEAN DEFAULT FALSE,
    additional_payee_rate_pct FLOAT,
    settlement_template_type VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL UNIQUE,
    hashed_password VARCHAR(500) NOT NULL,
    role userrole DEFAULT 'dispatcher',
    is_active BOOLEAN DEFAULT TRUE,
    dispatcher_id INTEGER REFERENCES dispatchers(id),
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loads (
    id SERIAL PRIMARY KEY,
    load_number INTEGER NOT NULL UNIQUE,
    status loadstatus DEFAULT 'New' NOT NULL,
    billing_status billingstatus DEFAULT 'Pending' NOT NULL,
    load_date DATE NOT NULL,
    actual_delivery_date DATE,
    rate FLOAT DEFAULT 0.0,
    total_miles INTEGER DEFAULT 0,
    loaded_miles INTEGER DEFAULT 0,
    empty_miles INTEGER DEFAULT 0,
    po_number VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    direct_billing BOOLEAN DEFAULT FALSE,
    driver_id INTEGER REFERENCES drivers(id),
    truck_id INTEGER REFERENCES trucks(id),
    trailer_id INTEGER REFERENCES trailers(id),
    broker_id INTEGER REFERENCES brokers(id),
    dispatcher_id INTEGER REFERENCES dispatchers(id),
    pay_type_snapshot VARCHAR(50),
    pay_rate_loaded_snapshot FLOAT,
    pay_rate_empty_snapshot FLOAT,
    freight_percentage_snapshot FLOAT,
    flatpay_snapshot FLOAT,
    drivers_payable_snapshot FLOAT,
    snapshot_taken_at TIMESTAMP,
    snapshot_overridden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS load_stops (
    id SERIAL PRIMARY KEY,
    load_id INTEGER NOT NULL REFERENCES loads(id),
    stop_type stoptype NOT NULL,
    stop_order INTEGER NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'US',
    stop_date DATE,
    address VARCHAR(500),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS load_services (
    id SERIAL PRIMARY KEY,
    load_id INTEGER NOT NULL REFERENCES loads(id),
    service_type servicetype NOT NULL,
    add_deduct VARCHAR(10) DEFAULT 'Add',
    invoice_amount FLOAT DEFAULT 0.0,
    drivers_payable FLOAT DEFAULT 0.0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS load_documents (
    id SERIAL PRIMARY KEY,
    load_id INTEGER NOT NULL REFERENCES loads(id),
    document_type documenttype NOT NULL,
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500),
    file_path VARCHAR(1000),
    file_size INTEGER,
    notes TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS load_history (
    id SERIAL PRIMARY KEY,
    load_id INTEGER NOT NULL REFERENCES loads(id),
    description TEXT NOT NULL,
    author VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS load_notes (
    id SERIAL PRIMARY KEY,
    load_id INTEGER NOT NULL REFERENCES loads(id),
    content TEXT NOT NULL,
    author VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_documents (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    doc_type driverdoctype NOT NULL,
    status VARCHAR(100),
    number VARCHAR(100),
    state VARCHAR(10),
    application_date DATE,
    hire_date DATE,
    termination_date DATE,
    issue_date DATE,
    exp_date DATE,
    notes TEXT,
    name VARCHAR(200),
    filename VARCHAR(500),
    original_filename VARCHAR(500),
    file_path VARCHAR(1000),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_profiles (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL UNIQUE REFERENCES drivers(id),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    hire_date DATE,
    termination_date DATE,
    address VARCHAR(500),
    address2 VARCHAR(500),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    payable_to VARCHAR(200),
    co_driver_id INTEGER REFERENCES drivers(id),
    truck_id INTEGER REFERENCES trucks(id),
    trailer_id INTEGER REFERENCES trailers(id),
    fuel_card VARCHAR(100),
    ifta_handled BOOLEAN DEFAULT TRUE,
    driver_status VARCHAR(50) DEFAULT 'Applicant',
    pay_type VARCHAR(50) DEFAULT 'per_mile',
    per_extra_stop FLOAT DEFAULT 0.0,
    freight_percentage FLOAT DEFAULT 0.0,
    flatpay FLOAT DEFAULT 0.0,
    hourly_rate FLOAT DEFAULT 0.0,
    notes TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_scheduled_transactions (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    trans_type VARCHAR(20) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    amount FLOAT DEFAULT 0.0,
    schedule VARCHAR(50),
    start_date DATE,
    end_date DATE,
    repeat_type VARCHAR(20),
    repeat_times INTEGER,
    times_applied INTEGER DEFAULT 0,
    last_applied DATE,
    next_due DATE,
    is_active BOOLEAN DEFAULT TRUE,
    payable_to VARCHAR(200),
    settlement_description TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlements (
    id SERIAL PRIMARY KEY,
    settlement_number INTEGER NOT NULL UNIQUE,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    payable_to VARCHAR(200),
    status settlementstatus DEFAULT 'Preparing',
    date DATE NOT NULL,
    settlement_total FLOAT DEFAULT 0.0,
    balance_due FLOAT DEFAULT 0.0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    qb_exported BOOLEAN DEFAULT FALSE,
    qb_exported_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_items (
    id SERIAL PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES settlements(id),
    load_id INTEGER REFERENCES loads(id),
    item_type VARCHAR(50) DEFAULT 'load',
    description TEXT,
    amount FLOAT DEFAULT 0.0,
    load_date DATE,
    load_status VARCHAR(50),
    load_billing_status VARCHAR(50),
    load_pickup_city VARCHAR(100),
    load_delivery_city VARCHAR(100),
    amount_snapshot FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_adjustments (
    id SERIAL PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES settlements(id),
    adj_type VARCHAR(20) NOT NULL,
    date DATE,
    category VARCHAR(100),
    description TEXT,
    amount FLOAT DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_payments (
    id SERIAL PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES settlements(id),
    payment_number VARCHAR(50),
    description TEXT,
    amount FLOAT DEFAULT 0.0,
    payment_date DATE,
    is_carryover BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_history (
    id SERIAL PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES settlements(id),
    description TEXT NOT NULL,
    author VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_email_logs (
    id SERIAL PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES settlements(id),
    to_email VARCHAR(500),
    cc_email VARCHAR(500),
    subject VARCHAR(500),
    body TEXT,
    sent_at TIMESTAMP DEFAULT NOW(),
    sent_by VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    expense_date DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount FLOAT NOT NULL,
    description TEXT,
    vendor_id INTEGER REFERENCES vendors(id),
    truck_id INTEGER REFERENCES trucks(id),
    driver_id INTEGER REFERENCES drivers(id),
    receipt_path VARCHAR(500),
    receipt_filename VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number INTEGER UNIQUE NOT NULL,
    load_id INTEGER NOT NULL REFERENCES loads(id),
    broker_id INTEGER REFERENCES brokers(id),
    invoice_date DATE NOT NULL,
    due_date DATE,
    status VARCHAR(50) DEFAULT 'Pending',
    amount FLOAT NOT NULL,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments_new (
    id SERIAL PRIMARY KEY,
    payment_number INTEGER UNIQUE,
    payment_type VARCHAR(30) NOT NULL,
    driver_id INTEGER REFERENCES drivers(id),
    vendor_id INTEGER REFERENCES vendors(id),
    settlement_id INTEGER REFERENCES settlements(id),
    applied_settlement_id INTEGER REFERENCES settlements(id),
    payment_date DATE NOT NULL,
    amount FLOAT NOT NULL,
    description TEXT,
    payable_to VARCHAR(200),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advanced_payments (
    id SERIAL PRIMARY KEY,
    payment_number INTEGER UNIQUE NOT NULL,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    vendor_id INTEGER REFERENCES vendors(id),
    payment_date DATE NOT NULL,
    amount FLOAT NOT NULL,
    description TEXT,
    category VARCHAR(100),
    applied_amount FLOAT DEFAULT 0.0,
    applied_to_settlement_id INTEGER REFERENCES settlements(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_loads_driver ON loads(driver_id);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_date ON loads(load_date);
CREATE INDEX IF NOT EXISTS idx_loads_billing ON loads(billing_status);
CREATE INDEX IF NOT EXISTS idx_settlements_driver ON settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlement_items_load ON settlement_items(load_id);
CREATE INDEX IF NOT EXISTS idx_adv_payments_driver ON advanced_payments(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_docs_driver ON driver_documents(driver_id);

-- Default admin user (password: Admin1234!)
INSERT INTO users (name, email, hashed_password, role, is_active)
SELECT 'Admin', 'admin@uzloads.com',
  '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
  'admin', TRUE
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@uzloads.com');

-- Default company settings
INSERT INTO company_settings (name, legal_name)
SELECT 'My Company', 'My Company LLC'
WHERE NOT EXISTS (SELECT 1 FROM company_settings LIMIT 1);

COMMIT;
