from sqlalchemy import Column, Integer, String, JSON, Float, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import enum

class UserRole(str, enum.Enum):
    JEWELER = "jeweler"
    HALLMARKING_CENTRE = "hallmarking_centre"
    REFINERY = "refinery"
    NCH_ADMIN = "nch_admin"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    company = Column(String)
    designation = Column(String)
    age = Column(Integer)
    company_type = Column(String(50))
    gender = Column(String(20))
    phone = Column(String(20), nullable=True)
    role = Column(String, nullable=False)  # jeweler, hallmarking_centre, refinery, nch_admin
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversations = relationship("Conversation", back_populates="user")
    query_logs = relationship("QueryLog", back_populates="user")
    leads = relationship("Lead", back_populates="user")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(String, index=True)
    platform = Column(String) # widget, whatsapp, mobile, etc.
    started_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    role = Column(String) # user or bot
    content = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    response_time_ms = Column(Float)

    conversation = relationship("Conversation", back_populates="messages")

class QueryLog(Base):
    __tablename__ = "query_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    question = Column(Text)
    answer = Column(Text)
    retrieved_chunk_ids = Column(JSON)
    confidence_score = Column(Float)
    language = Column(String) # en, hi, gu
    intent = Column(String(50))
    sentiment = Column(String(20))
    feedback_rating = Column(Integer) # e.g. 1 (thumbs up), -1 (thumbs down)
    platform = Column(String(20)) # app or whatsapp
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


    user = relationship("User", back_populates="query_logs")

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    interest_type = Column(String) # xrf, hallmarking, fire_assay, etc.
    status = Column(String, default="new") # new, contacted, converted
    captured_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="leads")

class GoldRate(Base):
    __tablename__ = "gold_rates"

    date = Column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    rate_per_gram_24k = Column(Float)
    rate_per_gram_22k = Column(Float)
    source = Column(String)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
