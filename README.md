# uzLoads TMS — Production-Ready Transportation Management System

## Stack
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + Alembic
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS

---

## Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

---

## Database Setup

### Option A — Alembic migrations (recommended)
```bash
cd backend
cp .env.example .env          # edit DATABASE_URL
pip install -r requirements.txt
alembic upgrade head
python seed.py                 # optional: seed demo data
```

### Option B — Manual SQL
```bash
psql -U postgres -c "CREATE DATABASE uzloads;"
psql -U postgres -d uzloads -f manual_migration.sql
```

---

## Backend

```bash
cd backend
cp .env.example .env          # set DATABASE_URL and SECRET_KEY
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs

---

## Frontend

```bash
cd frontend
cp .env.example .env          # set VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```

App: http://localhost:5173

---

## Default Login

| Field    | Value                |
|----------|----------------------|
| Email    | admin@uzloads.com    |
| Password | Admin1234!           |

---

## Production Build

```bash
# Frontend
cd frontend && npm run build
# Backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Project Structure

```
uzloads/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # All REST API routes
│   │   ├── crud/               # Database logic
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── services/           # PDF, pay calculation, reports
│   │   └── main.py
│   ├── alembic/                # DB migrations
│   ├── requirements.txt
│   └── seed.py
├── frontend/
│   ├── src/
│   │   ├── api/                # Axios API layer
│   │   ├── components/         # Reusable components
│   │   ├── hooks/              # React hooks
│   │   ├── pages/              # All page components
│   │   ├── types/              # TypeScript types
│   │   └── utils/              # Helpers, formatters
│   └── package.json
└── manual_migration.sql
```
