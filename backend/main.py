import os
from fastapi import FastAPI, Depends, HTTPException, status, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel

from datetime import timedelta

import time

# Local imports
from database import engine, Base, get_db
from models import User, QueryLog, Lead, Conversation, Message, GoldRate
from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_permission
)
from bot import HallmarkingBot
from gold_rate import start_gold_scheduler
from analytics import router as analytics_router
from whatsapp import router as whatsapp_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Hallmarking Bot Enterprise API",
    description="Backend API for Full-Stack AI Hallmarking Platform",
    version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analytics_router)
app.include_router(whatsapp_router)

ai_bot = HallmarkingBot()

# --- Pydantic Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    company: str
    role: str

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default_session"
    platform: str = "web_widget"

class ChatResponse(BaseModel):
    reply: str
    language: str
    intent: str
    confidence_score: float
    question: str = None


from models import UserRole

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    company_name: str
    designation: str
    age: int
    gender: str
    role: UserRole
    is_certified: str | None = None

# --- Endpoints ---

@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    ALLOWED_SELF_REGISTER_ROLES = [
        UserRole.JEWELER,
        UserRole.HALLMARKING_CENTRE,
        UserRole.REFINERY
    ]

    if request.role not in ALLOWED_SELF_REGISTER_ROLES:
        raise HTTPException(
            status_code=403,
            detail="This role cannot be self-registered. Contact NCH admin."
        )
        
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user = User(
        name=request.name,
        email=request.email,
        hashed_password=get_password_hash(request.password),
        company=request.company_name,
        designation=request.designation,
        age=request.age,
        gender=request.gender,
        role=request.role.value,
        company_type=request.role.value,
        is_certified=request.is_certified
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"msg": "User registered successfully", "user_id": user.id}

@app.post("/auth/login", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first() # Using username field for email
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role}, 
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/auth/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/bot/ask", response_model=ChatResponse)
def ask_bot(request: ChatRequest, req: Request, db: Session = Depends(get_db)):
    auth_header = req.headers.get("Authorization")
    user_id = None
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            from jose import jwt
            from auth import SECRET_KEY, ALGORITHM
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub")
            if email:
                user = db.query(User).filter(User.email == email).first()
                if user:
                    user_id = user.id
        except:
            pass
            
    if not user_id:
        # Fallback to Guest user
        guest = db.query(User).filter(User.email == "guest@nch.in").first()
        if not guest:
            guest = User(name="Guest", email="guest@nch.in", role="public_user")
            db.add(guest)
            db.commit()
            db.refresh(guest)
        user_id = guest.id
        
    # Call bot.py ask method which handles everything (translation, RAG, logging, lead capture)
    bot_result = ai_bot.ask(request.message, user_id, db)
    
    return ChatResponse(
        reply=bot_result["reply"],
        language=bot_result["language"],
        intent=bot_result["intent"],
        confidence_score=bot_result["confidence_score"]
    )

@app.post("/bot/ask-audio")
async def ask_bot_audio(file: UploadFile = File(...), req: Request = None, db: Session = Depends(get_db)):
    print(f"🟢 Received audio request! File: {file.filename}")
    auth_header = req.headers.get("Authorization") if req else None

    user_id = None
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            from jose import jwt
            from auth import SECRET_KEY, ALGORITHM
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub")
            if email:
                user = db.query(User).filter(User.email == email).first()
                if user:
                    user_id = user.id
        except:
            pass
            
    if not user_id:
        guest = db.query(User).filter(User.email == "guest@nch.in").first()
        if not guest:
            guest = User(name="Guest", email="guest@nch.in", role="public_user")
            db.add(guest)
            db.commit()
            db.refresh(guest)
        user_id = guest.id
        
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
        
    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        with open(tmp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=(file.filename, audio_file.read()),
                model="whisper-large-v3",
                response_format="text"
            )
            
        bot_result = ai_bot.ask(transcription, user_id, db)
        
        return ChatResponse(
            reply=bot_result["reply"],
            language=bot_result["language"],
            intent=bot_result["intent"],
            confidence_score=bot_result["confidence_score"],
            question=transcription
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio processing failed: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

@app.post("/setup/ingest")
def trigger_ingest():
    from data_pipeline import ingest_knowledge_base
    ingest_knowledge_base(clear_existing=True)
    return {"msg": "Ingestion completed successfully"}

@app.post("/admin/upload-knowledge")
async def upload_knowledge(file: UploadFile = File(...), current_user: User = Depends(require_permission(["nch_admin"]))):
    # Ensure directory exists
    os.makedirs("../data/knowledge", exist_ok=True)
    
    file_path = os.path.join("../data/knowledge", file.filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    # Trigger re-ingestion
    from data_pipeline import ingest_knowledge_base
    ingest_knowledge_base(data_dir="../data/knowledge", chroma_dir="../data/chroma_db", clear_existing=True)
    
    return {"msg": f"File {file.filename} uploaded and knowledge base updated."}

@app.get("/admin/knowledge-files")
def list_knowledge_files(current_user: User = Depends(require_permission(["nch_admin"]))):
    data_dir = "../data/knowledge"
    if not os.path.exists(data_dir):
        return []
    files = []
    for f in os.listdir(data_dir):
        path = os.path.join(data_dir, f)
        files.append({
            "name": f,
            "size": os.path.getsize(path),
            "type": f.split('.')[-1]
        })
    return files

@app.delete("/admin/knowledge-files/{filename}")
def delete_knowledge_file(filename: str, current_user: User = Depends(require_permission(["nch_admin"]))):
    file_path = os.path.join("../data/knowledge", filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        # Re-ingest after deletion
        from data_pipeline import ingest_knowledge_base
        ingest_knowledge_base(data_dir="../data/knowledge", chroma_dir="../data/chroma_db", clear_existing=True)
        return {"msg": f"File {filename} deleted and knowledge base updated."}
    raise HTTPException(status_code=404, detail="File not found")




@app.get("/admin/leads")
def get_leads(db: Session = Depends(get_db)):
    return db.query(Lead).all()

@app.patch("/admin/leads/{lead_id}")
def update_lead_status(lead_id: int, status_update: dict, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.status = status_update.get("status")
    db.commit()
    return {"msg": "Lead status updated"}


@app.get("/admin/users")
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@app.get("/admin/logs")
def get_logs(db: Session = Depends(get_db)):
    return db.query(QueryLog).all()

@app.post("/admin/users/{user_id}/reset-password")
def reset_password(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = get_password_hash("123456")
    db.commit()
    return {"msg": f"Password reset successfully to 123456 for user {user.email}"}

@app.get("/admin/analytics/summary")
def get_summary(db: Session = Depends(get_db)):
    return {
        "total_users": db.query(User).count(),
        "queries_today": db.query(QueryLog).count(),
        "leads_today": db.query(Lead).count(),
        "active_sessions_today": 5
    }

@app.get("/admin/analytics/query-volume")
def get_query_volume(db: Session = Depends(get_db)):
    return [
        {"date": "2026-05-10", "count": 5},
        {"date": "2026-05-11", "count": 12},
        {"date": "2026-05-12", "count": 8},
        {"date": "2026-05-13", "count": 15},
        {"date": "2026-05-14", "count": 20},
    ]

@app.get("/admin/analytics/intent-distribution")
def get_intent_dist(db: Session = Depends(get_db)):
    return [
        {"intent": "gold_rate", "count": 15},
        {"intent": "hallmarking", "count": 25},
        {"intent": "general", "count": 10},
    ]

@app.get("/admin/analytics/top-questions")
def get_top_questions(db: Session = Depends(get_db)):
    return [
        {"question": "How to get BIS?", "count": 10},
        {"question": "Gold rate today?", "count": 8},
        {"question": "What is hallmarking?", "count": 5},
    ]

@app.get("/admin/analytics/sentiment-trend")
def get_sentiment_trend(db: Session = Depends(get_db)):
    return [
        {"date": "2026-05-10", "positive": 3, "neutral": 1, "negative": 1},
        {"date": "2026-05-11", "positive": 8, "neutral": 2, "negative": 2},
        {"date": "2026-05-12", "positive": 5, "neutral": 2, "negative": 1},
    ]




@app.on_event("startup")
async def startup_event():
    db = next(get_db())
    start_gold_scheduler(db)

@app.get("/gold/rate")
def get_gold_rate(db: Session = Depends(get_db)):
    rate = db.query(GoldRate).order_by(
        GoldRate.date.desc()
    ).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Gold rate not available yet")
    return {
        "date": rate.date,
        "rate_24k": rate.rate_per_gram_24k,
        "rate_22k": rate.rate_per_gram_22k,
        "source": rate.source,
        "updated_at": rate.updated_at
    }

@app.post("/setup")
def create_initial_admin(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if user:
        return {"msg": "Setup already complete"}
    admin_user = User(
        name="Super Admin",
        email="admin@nch.in", 
        hashed_password=get_password_hash("admin123"), 
        role="nch_admin"
    )
    db.add(admin_user)
    db.commit()
    return {"msg": "Initial admin user created (admin@nch.in / admin123)"}
