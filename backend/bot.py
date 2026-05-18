import os
# pyrefly: ignore [missing-import]
from langdetect import detect
# pyrefly: ignore [missing-import]
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv
from deep_translator import GoogleTranslator
from sqlalchemy.orm import Session

load_dotenv()

class HallmarkingBot:
    def __init__(self, index_path="../data/faiss_index"):
        self.index_path = index_path
        
        # Free local embeddings
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        # Groq LLM (Fast Llama-3.3-70b-versatile)
        self.llm = ChatGroq(
            temperature=0, 
            groq_api_key=os.getenv("GROQ_API_KEY"), 
            model_name="llama-3.3-70b-versatile"
        )
        
        if os.path.exists(index_path):
            self.vectorstore = FAISS.load_local(index_path, self.embeddings, allow_dangerous_deserialization=True)
            self.is_ready = True
        else:
            self.vectorstore = None
            self.is_ready = False

        self.prompt_template = PromptTemplate(
            input_variables=["context", "question", "language"],
            template="""You are the Hallmarking Bot, an expert assistant for hallmarking centres, jewelers, and gold refineries in India.
Answer ONLY based on the provided context. If the answer is not in the context, say exactly: "Please contact NCH directly for this query."
Always be professional, accurate, and helpful.
You MUST reply entirely in the following language: {language}.


Context:
{context}

Question:
{question}

Answer:"""
        )

    def detect_language(self, text: str) -> str:
        try:
            return detect(text)
        except:
            return 'en'

    def translate_to_english(self, text: str, source_lang: str) -> str:
        if source_lang == 'en':
            return text
        try:
            return GoogleTranslator(source=source_lang, target='en').translate(text)
        except:
            return text

    def translate_from_english(self, text: str, target_lang: str) -> str:
        if target_lang == 'en':
            return text
        try:
            return GoogleTranslator(source='en', target=target_lang).translate(text)
        except:
            return text

    def classify_intent(self, text: str) -> str:
        text_lower = text.lower()
        if "rate" in text_lower or "price" in text_lower:
            return "gold_rate"
        elif "xrf" in text_lower:
            return "xrf_testing"
        elif "fire assay" in text_lower:
            return "fire_assay"
        elif "bis" in text_lower or "regulation" in text_lower:
            return "bis_regulation"
        elif "laser" in text_lower:
            return "laser_marking"
        elif "certif" in text_lower or "regist" in text_lower:
            return "certification"
        else:
            return "general"

    def analyze_sentiment(self, text: str) -> str:
        # A simple keyword based sentiment for MVP. Can be upgraded to LLM based later.
        text_lower = text.lower()
        positive_words = ["good", "great", "thanks", "helpful", "excellent"]
        negative_words = ["bad", "terrible", "useless", "wrong", "fail"]
        
        if any(word in text_lower for word in positive_words):
            return "positive"
        elif any(word in text_lower for word in negative_words):
            return "negative"
        return "neutral"

    def auto_capture_lead(self, user_id: int, intent: str, db: Session):
        LEAD_INTENTS = ["xrf_testing", "fire_assay", "hallmarking_process", "bis_regulation"]
        if intent not in LEAD_INTENTS:
            return
        from models import Lead
        existing = db.query(Lead).filter(
            Lead.user_id == user_id,
            Lead.interest_type == intent
        ).first()
        if not existing:
            lead = Lead(user_id=user_id, interest_type=intent, status='new')
            db.add(lead)
            db.commit()

    def get_personalized_append(self, user_id: int, intent: str, db: Session) -> str:
        from models import QueryLog, User
        from datetime import datetime
        
        # Rule 1: XRF asked 3+ times
        xrf_count = db.query(QueryLog).filter(
            QueryLog.user_id == user_id,
            QueryLog.intent == "xrf_testing"
        ).count()
        if xrf_count >= 3:
            return "\n\n💡 You've shown interest in XRF testing. Would you like to book an appointment with NCH?"

        # Rule 2: New jeweler under 7 days
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.designation == "owner":
            if user.created_at:
                days_old = (datetime.utcnow() - user.created_at.replace(tzinfo=None)).days
                if days_old < 7:
                    return "\n\n💡 As a new jeweler, would you like a guide on BIS registration?"

        # Rule 3: Refinery user
        if user and user.company_type == "refinery":
            return "\n\n💡 As a gold refinery, our Fire Assay testing service may be useful for you."

        return ""

    def ask(self, query: str, user_id: int, db: Session, platform: str = "app") -> dict:
        from models import User
        # 0. Get user from database
        user = db.query(User).filter(User.id == user_id).first()

        # 1. Detect language (just for logging, not for translation anymore)
        lang = self.detect_language(query)

        # Call RAG Pipeline directly with the original query
        from rag_pipeline import RAGPipeline
        rag = RAGPipeline()
        rag_result = rag.generate_response(query, user=user)

        
        final_answer = rag_result["answer"]




        # 5. Lead Auto-Capture
        intent = rag_result.get("intent", "general")
        self.auto_capture_lead(user_id, intent, db)

        # 6. Personalized Recommendations
        append_text = self.get_personalized_append(user_id, intent, db)
        final_answer += append_text

        # 7. Log to DB
        from models import QueryLog
        new_log = QueryLog(
            user_id=user_id,
            question=query,
            answer=final_answer,
            retrieved_chunk_ids=rag_result.get("sources", []),
            confidence_score=rag_result.get("confidence_score", 0.0),
            language=lang,
            intent=intent,
            sentiment=rag_result.get("sentiment", "neutral"),
            platform=platform
        )
        db.add(new_log)
        db.commit()


        return {
            "reply": final_answer,
            "language": lang,
            "intent": intent,
            "confidence_score": rag_result.get("confidence_score", 0.0)
        }
