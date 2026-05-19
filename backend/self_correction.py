import os
from sqlalchemy.orm import Session
from models import QueryLog, FeedbackCorrection
from groq import Groq
import threading

def auto_train_feedback(query_log_id: int, db: Session):
    """
    Background job that reads a negatively rated query,
    calls an LLM to self-correct the answer,
    and stores it in the feedback_corrections table.
    """
    log = db.query(QueryLog).filter(QueryLog.id == query_log_id).first()
    if not log or log.feedback_rating is None or log.feedback_rating >= 0:
        return # Only process negative feedback

    # Check if a correction already exists
    existing = db.query(FeedbackCorrection).filter(FeedbackCorrection.query_log_id == query_log_id).first()
    if existing:
        return

    # Extract original context
    context_chunks = log.retrieved_chunk_ids or []
    context_text = "\n\n".join(context_chunks)
    
    question = log.question
    failed_answer = log.answer

    prompt = f"""
    You are an AI expert reviewing a failed answer given to a user.
    The user asked: "{question}"
    The AI answered: "{failed_answer}"
    The user gave this answer a thumbs-down (negative feedback).

    Available Knowledge Context:
    {context_text}

    Task:
    1. Analyze why the AI's answer was poor or incorrect.
    2. Write a highly accurate, professional, and comprehensive new answer based strictly on the provided context.
    3. Ensure the answer is directly useful to the user.
    4. Provide ONLY the corrected answer text. No intros or explanations.
    """

    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        res = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        corrected_answer = res.choices[0].message.content.strip()

        if corrected_answer:
            correction = FeedbackCorrection(
                query_log_id=log.id,
                question=log.question,
                original_answer=log.answer,
                corrected_answer=corrected_answer
            )
            db.add(correction)
            db.commit()
            print(f"Self-correction logged for query ID: {log.id}")

    except Exception as e:
        print(f"Error during self-correction: {e}")

def trigger_self_correction(query_log_id: int, db: Session):
    """Triggers the self correction in a background thread"""
    thread = threading.Thread(target=auto_train_feedback, args=(query_log_id, db))
    thread.start()
