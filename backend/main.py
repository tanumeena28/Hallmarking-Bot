import os
from dotenv import load_dotenv

# Load environment variables from root directory first
parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
if os.path.exists(parent_env):
    load_dotenv(parent_env)
else:
    load_dotenv()

from typing import Optional
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


allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "*")
if allowed_origins_raw == "*" or not allowed_origins_raw:
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
    company: Optional[str] = None
    role: str
    designation: Optional[str] = None
    phone: Optional[str] = None
    bis_registration_number: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    is_certified: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default_session"
    platform: str = "web_widget"
    conversation_id: Optional[int] = None

class ChatResponse(BaseModel):
    reply: str
    language: str
    intent: str
    confidence_score: float
    log_id: int = None
    question: str = None
    conversation_id: Optional[int] = None


from models import UserRole

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    company_name: Optional[str] = None
    designation: str
    phone: str
    age: Optional[int] = None
    gender: Optional[str] = None
    role: Optional[UserRole] = None
    is_certified: str | None = None
    bis_registration_number: str | None = None
    invite_code: str | None = None

class ProfileUpdateRequest(BaseModel):
    name: str
    company: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    bis_registration_number: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None

class AddMemberRequest(BaseModel):
    name: str
    email: str
    password: str
    designation: str
    phone: str
    age: int
    gender: str

# --- Endpoints ---

@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    ALLOWED_SELF_REGISTER_ROLES = [
        UserRole.JEWELER,
        UserRole.HALLMARKING_CENTRE,
        UserRole.REFINERY
    ]

    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    if not request.phone or not request.phone.strip():
        raise HTTPException(status_code=400, detail="Mobile number is compulsory")

    inviter_company = None
    inviter_bis = None
    inviter_role = None
    inviter_company_type = None
    inviter_is_certified = None

    if request.invite_code:
        from models import Invitation
        invitation = db.query(Invitation).filter(Invitation.token == request.invite_code.strip().upper(), Invitation.status == "pending").first()
        if not invitation:
            raise HTTPException(status_code=400, detail="Invalid or expired invitation code")
            
        if invitation.invitee_email.strip().lower() != request.email.strip().lower():
            raise HTTPException(
                status_code=400,
                detail="This invitation code belongs to a different email. Please register with the email that received the invite."
            )
            
        inviter = db.query(User).filter(User.id == invitation.inviter_id).first()
        if not inviter:
            raise HTTPException(status_code=404, detail="Inviter user not found")
            
        inviter_company = inviter.company
        inviter_bis = inviter.bis_registration_number
        inviter_role = inviter.role
        inviter_company_type = inviter.company_type
        inviter_is_certified = inviter.is_certified
        
        # update invitation status
        invitation.status = "accepted"
        from sqlalchemy.sql import func
        invitation.accepted_at = func.now()
    else:
        # Standard flow validation
        if not request.role:
            raise HTTPException(status_code=400, detail="Role is required for registration")
        if request.role not in ALLOWED_SELF_REGISTER_ROLES:
            raise HTTPException(
                status_code=403,
                detail="This role cannot be self-registered. Contact admin."
            )

        if not request.bis_registration_number or not request.bis_registration_number.strip():
            raise HTTPException(status_code=400, detail="BIS Registration Number is compulsory")
            
        inviter_company = request.company_name
        inviter_bis = request.bis_registration_number
        inviter_role = request.role.value
        inviter_company_type = request.role.value
        inviter_is_certified = request.is_certified
        
    user = User(
        name=request.name,
        email=request.email,
        hashed_password=get_password_hash(request.password),
        company=inviter_company,
        designation=request.designation,
        phone=request.phone,
        bis_registration_number=inviter_bis,
        age=request.age,
        gender=request.gender,
        role=inviter_role,
        company_type=inviter_company_type,
        is_certified=inviter_is_certified
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Notify the inviter if this was an invited colleague registration
    if request.invite_code:
        try:
            from models import Conversation, Message, Invitation
            inv_token = request.invite_code.strip().upper()
            invitation = db.query(Invitation).filter(Invitation.token == inv_token).first()
            if invitation:
                # Find the latest conversation session for the inviter
                latest_conv = db.query(Conversation).filter(Conversation.user_id == invitation.inviter_id).order_by(Conversation.started_at.desc()).first()
                if not latest_conv:
                    # Create a default conversation session if none exists
                    latest_conv = Conversation(
                        user_id=invitation.inviter_id,
                        session_id="mobile_session",
                        platform="system"
                    )
                    db.add(latest_conv)
                    db.commit()
                    db.refresh(latest_conv)
                
                # Append the notification message
                notif_msg = Message(
                    conversation_id=latest_conv.id,
                    role="bot",
                    content=f"🔔 [System Notification]: Your colleague {user.name} ({user.email}) has registered and joined your team as a {user.designation}."
                )
                db.add(notif_msg)
                db.commit()
        except Exception as notify_err:
            print(f"Error creating joined notification message: {notify_err}")

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

@app.put("/auth/profile", response_model=UserResponse)
def update_profile(request: ProfileUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    
    current_user.name = request.name
    current_user.company = request.company
    current_user.designation = request.designation
    current_user.phone = request.phone
    current_user.bis_registration_number = request.bis_registration_number
    current_user.age = request.age
    current_user.gender = request.gender
    
    db.commit()
    db.refresh(current_user)
    return current_user

class InviteRequest(BaseModel):
    email: str
    name: Optional[str] = None

@app.post("/auth/invite")
def create_invite(request: InviteRequest, req: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import uuid
    # Generate unique 6-digit code or short UUID token
    token = str(uuid.uuid4())[:8].upper()
    
    from models import Invitation
    invitation = Invitation(
        token=token,
        inviter_id=current_user.id,
        invitee_email=request.email,
        invitee_name=request.name,
        status="pending"
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    
    # Construct direct invitation acceptance link
    import os
    base_url = os.getenv("BACKEND_URL")
    if not base_url:
        base_url = str(req.base_url)
    if not base_url.endswith("/"):
        base_url += "/"
    accept_link = f"{base_url}invite/accept?code={token}&email={request.email}"
    
    # Construct local testing Expo Go deep link
    host_header = req.headers.get("host", "localhost:8000")
    ip_address = host_header.split(":")[0]
    expo_link = f"exp://{ip_address}:8081/--/register?code={token}&email={request.email}"
    
    # Send direct invitation email
    try:
        from email_service import send_invitation_email
        send_invitation_email(
            to_email=request.email,
            invite_code=token,
            inviter_name=current_user.name or current_user.email,
            company_name=current_user.company or "our company",
            accept_link=accept_link,
            expo_link=expo_link
        )
    except Exception as e:
        print(f"Error triggering invitation email: {e}")
    
    return {
        "msg": "Invitation code created successfully and invitation email sent",
        "code": "****",
        "email": request.email,
        "company": current_user.company
    }

@app.get("/auth/invites")
def list_invites(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from models import Invitation
    invites = db.query(Invitation).filter(Invitation.inviter_id == current_user.id).order_by(Invitation.created_at.desc()).all()
    
    result = []
    for inv in invites:
        registered_user = db.query(User).filter(User.email == inv.invitee_email).first()
        result.append({
            "id": inv.id,
            "code": "****",
            "email": inv.invitee_email,
            "name": registered_user.name if registered_user else (inv.invitee_name or "Colleague"),
            "phone": registered_user.phone if registered_user else None,
            "designation": registered_user.designation if registered_user else None,
            "status": "joined" if (inv.status == "accepted" or registered_user is not None) else "pending",
            "created_at": inv.created_at,
            "accepted_at": inv.accepted_at
        })
    return result

@app.get("/auth/invite/verify/{code}")
def verify_invite(code: str, db: Session = Depends(get_db)):
    from models import Invitation, User
    inv = db.query(Invitation).filter(Invitation.token == code.upper().strip()).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation code not found")
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="Invitation already accepted or expired")
        
    inviter = db.query(User).filter(User.id == inv.inviter_id).first()
    if not inviter:
        raise HTTPException(status_code=404, detail="Inviter user not found")
        
    return {
        "code": inv.token,
        "inviter_name": inviter.name,
        "company": inviter.company,
        "company_type": inviter.company_type,
        "role": inviter.role,
        "is_certified": inviter.is_certified,
        "bis_registration_number": inviter.bis_registration_number,
        "invitee_email": inv.invitee_email
    }

@app.get("/invite/accept")
def accept_invite_page(code: str, email: str, req: Request):
    from fastapi.responses import HTMLResponse
    
    app_link = f"hallmarkingbot://register?code={code}&email={email}"
    
    host_header = req.headers.get("host", "localhost:8000")
    ip_address = host_header.split(":")[0]
    expo_link = f"exp://{ip_address}:8081/--/register?code={code}&email={email}"
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Portal | Hallmarking Bot</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #003087;
      --primary-hover: #0a47b2;
      --accent: #D4AF37;
      --accent-hover: #F3CD5F;
      --dark-bg: #030712;
      --card-bg: rgba(17, 24, 39, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --success: #10b981;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--dark-bg);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(0, 48, 135, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(212, 175, 55, 0.08) 0%, transparent 40%);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 24px;
    }
    
    .card {
      max-width: 440px;
      width: 100%;
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 40px 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
      animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .logo-badge {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: linear-gradient(135deg, var(--primary) 0%, #001f5c 100%);
      border: 2px solid var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      box-shadow: 0 0 25px rgba(0, 48, 135, 0.4);
      position: relative;
    }
    
    .logo-badge::after {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 20px;
      border: 1px solid var(--accent);
      animation: pulseGlow 2s infinite;
      opacity: 0;
    }
    
    @keyframes pulseGlow {
      0% {
        transform: scale(1);
        opacity: 0.5;
      }
      100% {
        transform: scale(1.25);
        opacity: 0;
      }
    }
    
    .logo-icon {
      font-size: 32px;
      line-height: 1;
    }
    
    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin-bottom: 8px;
    }
    
    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 28px;
    }
    
    .credential-box {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 28px;
      text-align: left;
    }
    
    .credential-row {
      margin-bottom: 12px;
    }
    
    .credential-row:last-child {
      margin-bottom: 0;
    }
    
    .credential-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--accent);
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .credential-value {
      font-size: 14px;
      font-weight: 500;
      color: #ffffff;
      word-break: break-all;
    }
    
    .credential-value.code {
      font-family: monospace;
      font-size: 20px;
      letter-spacing: 3px;
      font-weight: 700;
      color: #ffffff;
    }
    
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      height: 52px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease-in-out;
      cursor: pointer;
      border: none;
      margin-bottom: 12px;
    }
    
    .btn-primary {
      background: var(--accent);
      color: #030712;
      box-shadow: 0 4px 15px rgba(212, 175, 55, 0.2);
    }
    
    .btn-primary:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.3);
    }
    
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-1px);
    }
    
    .status-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 20px;
      font-size: 13px;
      color: var(--text-muted);
    }
    
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--success);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      animation: pulseDot 1.6s infinite;
    }
    
    @keyframes pulseDot {
      0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      }
      70% {
        transform: scale(1);
        box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
      }
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
      }
    }
    
    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      margin: 28px 0;
      color: rgba(255, 255, 255, 0.15);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      font-weight: 500;
    }
    
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    .divider:not(:empty)::before {
      margin-right: 12px;
    }
    
    .divider:not(:empty)::after {
      margin-left: 12px;
    }
    
    .download-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    
    .badge-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      text-decoration: none;
      color: var(--text);
      transition: all 0.2s ease;
    }
    
    .badge-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.1);
    }
    
    .badge-title {
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 2px;
    }
    
    .badge-subtitle {
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-badge">
      <span class="logo-icon">🔒</span>
    </div>
    
    <h1>Register Workspace</h1>
    <p class="subtitle">You've been invited to join the Hallmarking Bot network. Launch registration directly in the mobile application.</p>
    
    <div class="credential-box">
      <div class="credential-row">
        <div class="credential-label">Workspace Member</div>
        <div class="credential-value">{email}</div>
      </div>
      <div class="credential-row">
        <div class="credential-label">Access Token</div>
        <div class="credential-value code">{code}</div>
      </div>
    </div>
    
    <a href="{app_link}" class="btn btn-primary">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
      Open in Mobile App
    </a>
    
    <a href="{expo_link}" class="btn btn-secondary">
      Open in Expo Go
    </a>
    
    <div class="status-container">
      <div class="pulse-dot"></div>
      <span id="status-text">Redirecting to app automatically...</span>
    </div>
    
    <div class="divider">Don't have the app?</div>
    
    <div class="download-grid">
      <a href="https://play.google.com/store/apps/details?id=com.tanumeena.hallmarkingbot" target="_blank" class="badge-btn">
        <span class="badge-title">GET IT ON</span>
        <span class="badge-subtitle">Google Play</span>
      </a>
      <a href="#" class="badge-btn">
        <span class="badge-title">DOWNLOAD</span>
        <span class="badge-subtitle">Android APK</span>
      </a>
    </div>
  </div>
  
  <script>
    window.onload = function() {
      var appOpened = false;
      
      // Attempt to launch custom URI scheme
      window.location.href = "{app_link}";
      
      // Listen to window focus/blur/visibility changes
      window.addEventListener("blur", function() {
        appOpened = true;
        document.getElementById("status-text").innerText = "Application launched successfully.";
      });
      document.addEventListener("visibilitychange", function() {
        if (document.hidden) {
          appOpened = true;
          document.getElementById("status-text").innerText = "Application launched successfully.";
        }
      });
      
      // If browser remains active after 3 seconds, assume app is not installed and redirect to Play Store
      setTimeout(function() {
        if (!appOpened) {
          document.getElementById("status-text").innerText = "App not detected. Redirecting to Play Store...";
          setTimeout(function() {
            window.location.href = "https://play.google.com/store/apps/details?id=com.tanumeena.hallmarkingbot";
          }, 1000);
        }
      }, 3000);
    };
  </script>
</body>
</html>"""
    
    response_html = html_content.replace("{code}", code).replace("{app_link}", app_link).replace("{expo_link}", expo_link).replace("{email}", email)
    return HTMLResponse(content=response_html)

@app.post("/auth/add-member")
def add_team_member(request: AddMemberRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Verify email uniqueness
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
        
    new_user = User(
        name=request.name,
        email=request.email,
        hashed_password=get_password_hash(request.password),
        company=current_user.company,
        designation=request.designation,
        phone=request.phone,
        bis_registration_number=current_user.bis_registration_number,
        age=request.age,
        gender=request.gender,
        role=current_user.role,
        company_type=current_user.company_type,
        is_certified=current_user.is_certified
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"msg": "Team member added successfully", "user_id": new_user.id}

@app.post("/chat/conversations")
def create_new_session(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_conv = Conversation(
        user_id=current_user.id,
        session_id="mobile_session",
        platform="app"
    )
    db.add(db_conv)
    db.commit()
    db.refresh(db_conv)
    return {"conversation_id": db_conv.id, "started_at": db_conv.started_at}

@app.get("/chat/conversations")
def list_user_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversations = db.query(Conversation).filter(Conversation.user_id == current_user.id).order_by(Conversation.started_at.desc()).all()
    
    result = []
    for conv in conversations:
        # Fetch the last message in this session to display as a preview
        last_msg = db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.timestamp.desc()).first()
        preview = last_msg.content if last_msg else "New Conversation"
        # Truncate preview
        if len(preview) > 50:
            preview = preview[:47] + "..."
        result.append({
            "id": conv.id,
            "started_at": conv.started_at.isoformat() if conv.started_at else None,
            "preview": preview
        })
    return result

@app.get("/chat/conversations/{conversation_id}/messages")
def get_session_messages(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation session not found")
        
    messages = db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.timestamp.asc()).all()
    res = []
    for msg in messages:
        rating = None
        language = None
        if msg.query_log_id:
            log = db.query(QueryLog).filter(QueryLog.id == msg.query_log_id).first()
            if log:
                rating = log.feedback_rating
                language = log.language
        res.append({
            "id": msg.id,
            "role": msg.role,
            "content": msg.content,
            "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
            "query_log_id": msg.query_log_id,
            "feedback_rating": rating,
            "language": language
        })
    return res

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
        
    conversation_id = request.conversation_id
    if not conversation_id and user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.email != "guest@nch.in":
            from models import Conversation
            db_conv = Conversation(
                user_id=user_id,
                session_id=request.session_id,
                platform=request.platform
            )
            db.add(db_conv)
            db.commit()
            db.refresh(db_conv)
            conversation_id = db_conv.id

    # Call bot.py ask method which handles everything (translation, RAG, logging, lead capture)
    bot_result = ai_bot.ask(request.message, user_id, db, platform=request.platform, conversation_id=conversation_id)
    
    return ChatResponse(
        reply=bot_result["reply"],
        language=bot_result["language"],
        intent=bot_result["intent"],
        confidence_score=bot_result["confidence_score"],
        log_id=bot_result.get("log_id"),
        conversation_id=conversation_id
    )

class FeedbackRequest(BaseModel):
    log_id: int
    rating: int  # 1 for thumbs up, -1 for thumbs down

@app.post("/bot/feedback")
def submit_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    from models import QueryLog
    from self_correction import trigger_self_correction
    
    log = db.query(QueryLog).filter(QueryLog.id == request.log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Query log not found")
        
    log.feedback_rating = request.rating
    db.commit()
    
    if request.rating < 0:
        print(f"Negative feedback received for log {log.id}. Triggering self-correction...")
        trigger_self_correction(log.id)
        
    return {"msg": "Feedback saved successfully"}

@app.get("/bot/speak")
def bot_speak(text: str, language: str = "en"):
    from fastapi.responses import FileResponse
    from tts_service import synthesize_speech
    import os
    
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text parameter is required")
        
    try:
        audio_path = synthesize_speech(text, language)
        if not os.path.exists(audio_path):
            raise HTTPException(status_code=500, detail="Failed to locate generated audio file")
        return FileResponse(audio_path, media_type="audio/mpeg", filename="speech.mp3")
    except Exception as e:
        print(f"ERROR in /bot/speak: {e}")
        raise HTTPException(status_code=500, detail=f"Speech synthesis error: {str(e)}")

@app.get("/bot/tts-info")
def get_tts_info():
    provider = os.getenv("TTS_PROVIDER", "auto").lower().strip()
    
    actual_provider = "gtts"
    is_premium = False
    
    bhashini_api_key = os.getenv("BHASHINI_API_KEY")
    bhashini_user_id = os.getenv("BHASHINI_USER_ID")
    google_api_key = os.getenv("GOOGLE_API_KEY")
    
    if provider == "bhashini":
        actual_provider = "bhashini"
        is_premium = True
    elif provider == "google":
        actual_provider = "google"
        is_premium = True
    elif provider == "gtts":
        actual_provider = "gtts"
        is_premium = False
    elif provider == "auto" or not provider:
        if bhashini_api_key and bhashini_user_id:
            actual_provider = "bhashini"
            is_premium = True
        elif google_api_key:
            actual_provider = "google"
            is_premium = True
            
    return {
        "provider": actual_provider,
        "is_premium": is_premium
    }

@app.post("/bot/ask-audio", response_model=ChatResponse)
async def ask_bot_audio(conversation_id: int = None, file: UploadFile = File(...), req: Request = None, db: Session = Depends(get_db)):
    print(f"DEBUG: Received audio request! File: {file.filename}")
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
        from stt_service import transcribe_audio
        content_type = file.content_type or "audio/wav"
        transcription = transcribe_audio(tmp_path, content_type=content_type)
        
        from rag_pipeline import RAGPipeline
        rag = RAGPipeline()
        refined_transcription = rag.refine_fuzzy_transcript(transcription)
        
        # If conversation_id is not passed, start one
        if not conversation_id and user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.email != "guest@nch.in":
                from models import Conversation
                db_conv = Conversation(
                    user_id=user_id,
                    session_id="audio_session",
                    platform="app"
                )
                db.add(db_conv)
                db.commit()
                db.refresh(db_conv)
                conversation_id = db_conv.id
                
        bot_result = ai_bot.ask(refined_transcription, user_id, db, platform="app", conversation_id=conversation_id)
        
        return ChatResponse(
            reply=bot_result["reply"],
            language=bot_result["language"],
            intent=bot_result["intent"],
            confidence_score=bot_result["confidence_score"],
            log_id=bot_result.get("log_id"),
            conversation_id=conversation_id,
            question=refined_transcription
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
    users = db.query(User).all()
    from models import Invitation
    
    result = []
    for user in users:
        invited_by = None
        invitation_received = db.query(Invitation).filter(Invitation.invitee_email == user.email).first()
        if invitation_received:
            inviter = db.query(User).filter(User.id == invitation_received.inviter_id).first()
            if inviter:
                invited_by = {
                    "id": inviter.id,
                    "name": inviter.name,
                    "email": inviter.email
                }
        
        invitations_sent = db.query(Invitation).filter(Invitation.inviter_id == user.id).all()
        teammates = []
        for inv in invitations_sent:
            invitee_user = db.query(User).filter(User.email == inv.invitee_email).first()
            teammates.append({
                "email": inv.invitee_email,
                "name": invitee_user.name if invitee_user else (inv.invitee_name or "Colleague"),
                "phone": invitee_user.phone if invitee_user else None,
                "designation": invitee_user.designation if invitee_user else None,
                "status": "joined" if invitee_user is not None else "pending",
                "joined_at": invitee_user.created_at if invitee_user else None
            })
            
        result.append({
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "company": user.company,
            "designation": user.designation,
            "role": user.role,
            "age": user.age,
            "gender": user.gender,
            "company_type": user.company_type,
            "created_at": user.created_at,
            "invited_by": invited_by,
            "teammates": teammates
        })
    return result

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

@app.get("/admin/users/{user_id}/chat-history")
def get_user_chat_history(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    conversations = db.query(Conversation).filter(Conversation.user_id == user_id).order_by(Conversation.started_at.desc()).all()
    
    result = []
    for conv in conversations:
        messages = db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.timestamp.asc()).all()
        result.append({
            "conversation_id": conv.id,
            "platform": conv.platform,
            "started_at": conv.started_at,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "timestamp": m.timestamp
                } for m in messages
            ]
        })
    return result

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
        "rate_silver": rate.rate_per_gram_silver,
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
