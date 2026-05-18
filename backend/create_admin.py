from database import SessionLocal
from models import User
from auth import get_password_hash

db = SessionLocal()
try:
    user = db.query(User).filter(User.email == "admin@nch.in").first()
    if user:
        print("Admin user already exists!")
    else:
        admin_user = User(
            name="Super Admin",
            email="admin@nch.in",
            hashed_password=get_password_hash("admin123"),
            role="nch_admin"
        )
        db.add(admin_user)
        db.commit()
        print("Admin user created successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
