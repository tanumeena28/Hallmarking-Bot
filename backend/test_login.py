from database import SessionLocal
from models import User
from auth import verify_password

db = SessionLocal()
try:
    user = db.query(User).filter(User.email == "admin@nch.in").first()
    if not user:
        print("User not found!")
    else:
        print(f"User found: {user.email}")
        is_valid = verify_password("admin123", user.hashed_password)
        print(f"Password valid: {is_valid}")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
