@echo off
echo =========================================
echo   ezLoads TMS - Production Installer
echo =========================================
echo.

echo Installing backend...
cd backend
python -m venv venv
call venv\Scripts\activate.bat
pip install -q -r requirements.txt
echo Running migrations...
alembic upgrade head
cd ..

echo Installing frontend...
cd frontend
call npm install --silent
cd ..

echo.
echo =========================================
echo   Installation complete!
echo =========================================
echo.
echo To start:
echo   Backend:  cd backend ^&^& venv\Scripts\activate ^&^& uvicorn app.main:app --reload --port 8000
echo   Frontend: cd frontend ^&^& npm run dev
echo.
pause
