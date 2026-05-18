@echo off
echo Setting up NCH Hallmarking Bot Backend...

echo Creating virtual environment...
python -m venv venv

echo Activating virtual environment...
call venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt

echo Running database migrations...
alembic upgrade head

echo Ingesting knowledge base...
curl -X POST http://localhost:8000/setup/ingest

echo Setup complete!
echo Run: uvicorn main:app --reload
pause
