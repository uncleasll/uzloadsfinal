#!/bin/bash
# Installer for ezLoads TMS

set -e

echo "═══════════════════════════════════════════"
echo "  ezLoads TMS — Production Installer"
echo "═══════════════════════════════════════════"
echo ""

# Backend
echo "→ Installing backend..."
cd backend
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -q -r requirements.txt
echo "  ✓ Python dependencies installed"

# Migrations
echo "→ Running database migrations..."
alembic upgrade head
echo "  ✓ Migrations applied"

cd ..

# Frontend
echo "→ Installing frontend..."
cd frontend
npm install --silent
echo "  ✓ Node dependencies installed"
cd ..

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ Installation complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "To start:"
echo "  Backend:  cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo "  Frontend: cd frontend && npm run dev"
echo ""
echo "(Optional) Seed demo data:"
echo "  cd backend && python seed.py"
echo ""
