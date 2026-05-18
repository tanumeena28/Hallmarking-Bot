# Local Setup Guide (Windows)

## Step 1 — PostgreSQL Setup
1. Download from: postgresql.org/download/windows
2. Install with default settings
3. Set password: postgres123
4. Keep port: 5432
5. Open pgAdmin after install
6. Create database named: nch_audit

## Step 2 — Backend Setup
Open terminal in /backend folder:
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
Edit .env and fill your API keys
alembic upgrade head
uvicorn main:app --reload
Backend running at: http://localhost:8000
API docs at: http://localhost:8000/docs

## Step 3 — Management UI Setup
Open new terminal in /management-ui folder:
npm install
npm run dev
Dashboard at: http://localhost:5173

## Step 4 — Mobile App Setup
Open new terminal in /mobile folder:
npm install
npx expo start
Scan QR code with Expo Go app

## Step 5 — Ingest Knowledge Base
After backend is running:
curl -X POST http://localhost:8000/setup/ingest

## Verify Everything Works
- Backend: http://localhost:8000/docs
- Dashboard: http://localhost:5173
- Mobile: Expo Go QR scan
