from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import csv
import io

from database import get_db
from models import User, QueryLog, Lead, Conversation, Message
from auth import require_permission

router = APIRouter()

# All endpoints require nch_employee or nch_admin role except feedback

@router.get("/admin/analytics/summary")
def get_summary(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    today = datetime.utcnow().date()
    
    total_users = db.query(User).count()
    queries_today = db.query(QueryLog).filter(func.date(QueryLog.timestamp) == today).count()
    leads_today = db.query(Lead).filter(func.date(Lead.captured_at) == today).count()
    
    # Active sessions today
    from models import Conversation
    active_sessions_today = db.query(Conversation).filter(func.date(Conversation.started_at) == today).count()
    
    return {
        "total_users": total_users,
        "queries_today": queries_today,
        "leads_today": leads_today,
        "active_sessions_today": active_sessions_today
    }

@router.get("/admin/analytics/query-volume")
def get_query_volume(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    # Daily query count for last 30 days
    thirty_days_ago = datetime.utcnow().date() - timedelta(days=30)
    
    results = db.query(
        func.date(QueryLog.timestamp).label('date'),
        func.count(QueryLog.id).label('count')
    ).filter(QueryLog.timestamp >= thirty_days_ago).group_by(func.date(QueryLog.timestamp)).order_by(func.date(QueryLog.timestamp)).all()
    
    return [{"date": str(r.date), "count": r.count} for r in results]

@router.get("/admin/analytics/intent-distribution")
def get_intent_distribution(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    results = db.query(
        QueryLog.intent,
        func.count(QueryLog.id).label('count')
    ).group_by(QueryLog.intent).all()
    
    return [{"intent": r.intent or "unknown", "count": r.count} for r in results]

@router.get("/admin/analytics/top-questions")
def get_top_questions(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    # Top 10 most frequent questions this week
    one_week_ago = datetime.utcnow() - timedelta(days=7)
    
    results = db.query(
        QueryLog.question,
        func.count(QueryLog.id).label('count')
    ).filter(QueryLog.timestamp >= one_week_ago).group_by(QueryLog.question).order_by(func.count(QueryLog.id).desc()).limit(10).all()
    
    return [{"question": r.question, "count": r.count} for r in results]

@router.get("/admin/analytics/sentiment-trend")
def get_sentiment_trend(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    # Daily sentiment breakdown last 30 days
    thirty_days_ago = datetime.utcnow().date() - timedelta(days=30)
    
    results = db.query(
        func.date(QueryLog.timestamp).label('date'),
        QueryLog.sentiment,
        func.count(QueryLog.id).label('count')
    ).filter(QueryLog.timestamp >= thirty_days_ago).group_by(func.date(QueryLog.timestamp), QueryLog.sentiment).all()
    
    trend = {}
    for r in results:
        d = str(r.date)
        if d not in trend:
            trend[d] = {"date": d, "positive": 0, "negative": 0, "neutral": 0}
        trend[d][r.sentiment or "neutral"] = r.count
        
    return list(trend.values())

@router.get("/admin/analytics/leads")
def get_analytics_leads(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    leads = db.query(Lead).all()
    results = []
    for lead in leads:
        user = db.query(User).filter(User.id == lead.user_id).first()
        results.append({
            "id": lead.id,
            "name": user.name if user else "Unknown",
            "company": user.company if user else "Unknown",
            "interest_type": lead.interest_type,
            "status": lead.status,
            "captured_at": lead.captured_at
        })
    return results

@router.patch("/admin/leads/{lead_id}")
def update_lead_status(lead_id: int, data: dict, db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    status = data.get("status")
    if status not in ["new", "contacted", "converted"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    lead.status = status
    db.commit()
    return {"msg": "Lead status updated"}

@router.get("/admin/logs")
def get_logs(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    logs = db.query(QueryLog).order_by(QueryLog.timestamp.desc()).all()
    results = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        results.append({
            "id": log.id,
            "question": log.question,
            "answer": log.answer,
            "language": log.language,
            "intent": log.intent,
            "sentiment": log.sentiment,
            "feedback_rating": log.feedback_rating,
            "platform": log.platform or "app",
            "timestamp": log.timestamp,
            "user_name": user.name if user else "Guest"
        })
    return results

@router.get("/admin/analytics/export-csv")

def export_csv(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_employee", "nch_admin"]))):
    logs = db.query(QueryLog).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow(["ID", "User ID", "Question", "Answer", "Intent", "Sentiment", "Language", "Timestamp"])
    
    for log in logs:
        writer.writerow([log.id, log.user_id, log.question, log.answer, log.intent, log.sentiment, log.language, log.timestamp])
        
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="nch_query_logs.csv"'
        }
    )

@router.get("/admin/users")
def get_users(db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_admin"]))):
    users = db.query(User).all()
    return [{
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "company": u.company,
        "designation": u.designation,
        "role": u.role,
        "age": u.age,
        "gender": u.gender,
        "company_type": u.company_type,
        "created_at": u.created_at
    } for u in users]




@router.get("/admin/users/{user_id}/chat-history")
def get_user_chat_history(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_permission(["nch_admin"]))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    conversations = db.query(Conversation).filter(Conversation.user_id == user_id).order_by(Conversation.started_at.desc()).all()
    
    results = []
    for conv in conversations:
        msgs = db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.timestamp.asc()).all()
        messages_list = []
        for m in msgs:
            rating = None
            if m.query_log_id:
                log = db.query(QueryLog).filter(QueryLog.id == m.query_log_id).first()
                if log:
                    rating = log.feedback_rating
            messages_list.append({
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "timestamp": m.timestamp,
                "query_log_id": m.query_log_id,
                "feedback_rating": rating
            })
        results.append({
            "conversation_id": conv.id,
            "session_id": conv.session_id,
            "platform": conv.platform,
            "started_at": conv.started_at,
            "messages": messages_list
        })
    return results
