import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
db_url = os.getenv("DATABASE_URL")

engine = create_engine(db_url)

with engine.connect() as conn:
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS feedback_corrections (
                id SERIAL PRIMARY KEY,
                query_log_id INTEGER REFERENCES query_logs(id),
                question TEXT,
                original_answer TEXT,
                corrected_answer TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS ix_feedback_corrections_question ON feedback_corrections(question);
        """))
        conn.commit()
        print("Successfully created feedback_corrections table!")
    except Exception as e:
        print(f"Error creating table: {e}")
