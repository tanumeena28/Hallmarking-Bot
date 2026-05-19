from dotenv import load_dotenv
import os
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
import os
import requests
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from textblob import TextBlob
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from groq import Groq

load_dotenv()

def get_user_context_prompt(user) -> str:
    if not user:
        return ""

    if user.role == "jeweler":
        return """
        This user is a jeweler (existing or new).
        Focus on: hallmarking process, BIS certification,
        required documents, gold purity standards (916, 750, 585).
        If new jeweler: proactively guide BIS registration steps.
        """
    elif user.role == "hallmarking_centre":
        return """
        This user owns or works at a hallmarking centre.
        Focus on: XRF machine calibration, BIS compliance,
        license renewal, equipment maintenance.
        """
    elif user.role == "refinery":
        return """
        This user works at a gold refinery.
        Focus on: fire assay process, 999 purity certification,
        melting procedures, refinery BIS regulations.
        """
    else:
        return ""

class RAGPipeline:
    def __init__(self, chroma_dir="../data/chroma_db"):
        self.chroma_dir = chroma_dir
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        if os.path.exists(chroma_dir):
            self.vectorstore = Chroma(
                collection_name="hallmarking_knowledge",
                embedding_function=self.embeddings,
                persist_directory=chroma_dir
            )
            self.is_ready = True
        else:
            self.vectorstore = None
            self.is_ready = False

    def classify_intent(self, text: str) -> str:
        text = text.lower()
        if any(w in text for w in ["xrf", "x-ray", "purity check", "testing machine"]):
            return "xrf_testing"
        if any(w in text for w in ["gold rate", "price", "916", "22k", "24k", "today rate"]):
            return "gold_rate"
        if any(w in text for w in ["bis", "license", "registration", "certificate", "renew"]):
            return "bis_regulation"
        if any(w in text for w in ["hallmark", "process", "steps", "how to", "procedure"]):
            return "hallmarking_process"
        if any(w in text for w in ["fire assay", "assay", "refinery", "melting"]):
            return "fire_assay"
        if any(w in text for w in ["laser", "marking", "engraving"]):
            return "laser_marking"
        return "general"

    def analyze_sentiment(self, text: str) -> str:
        score = TextBlob(text).sentiment.polarity
        if score > 0.1: return "positive"
        if score < -0.1: return "negative"
        return "neutral"

    def generate_response(self, query: str, user=None) -> dict:
        if not self.is_ready or self.vectorstore is None:
            return {
                "answer": "Error: RAG index not found. Please run ingestion first.",
                "sources": [],
                "intent": "error",
                "sentiment": "neutral",
                "confidence_score": 0.0
            }

        import time
        start_time = time.time()

        # 1. Classify Intent
        intent = self.classify_intent(query)

        # 2. Analyze Sentiment
        sentiment = self.analyze_sentiment(query)

        # Translate to English for search (since index is in English)
        from deep_translator import GoogleTranslator
        try:
            search_query = GoogleTranslator(source='auto', target='en').translate(query)
            print(f"DEBUG - Original: {query} -> Search: {search_query}")
        except:
            search_query = query

        # 3. ChromaDB Search
        docs = self.vectorstore.similarity_search(search_query, k=5)
        context = "\n\n".join([doc.page_content for doc in docs])

        # 4. Build System Prompt
        user_context = get_user_context_prompt(user)
        
        system_prompt = f"""You are the Hallmarking Bot, an expert assistant for hallmarking centres, jewelers, and gold refineries in India.
Answer ONLY based on the provided context below.
If the answer is not in the context, say exactly: "Please contact Admin directly for this query."
Be professional, accurate, and helpful.

CRITICAL: You MUST reply in the SAME language and script as the user's question.
- If the question is in Hinglish (Hindi in Latin script like 'HUID kya hai?'), reply in Hinglish!
- If the question is in Hindi (Devanagari like 'HUID क्या है?'), reply in Hindi!
- If the question is in Odia, reply in Odia!
- If the question is in Bengali, reply in Bengali!
- If the question is in English, reply in English!
Match the user's language and tone perfectly.

At the end of your answer, ALWAYS ask the user if they are satisfied with the answer in the SAME language.
Examples:
- In Hinglish: "Kya aap is jawab se satisfied hain? (Yes/No)"
- In Hindi: "क्या आप इस जवाब से संतुष्ट हैं? (हाँ/नहीं)"
- In Telugu: "మీరు ఈ సమాధానంతో సంతృప్తి చెందారా? (అవును/కాదు)"

{user_context}

Context:
{context}

Question: {query}"""



        # 5. Call LLM
        llm_provider = "groq"
        answer = ""

        if llm_provider == "ollama":
            try:
                res = requests.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": "llama3.1",
                        "prompt": system_prompt,
                        "stream": False
                    },
                    timeout=30
                )
                answer = res.json().get("response", "")
            except Exception as e:
                print(f"Ollama error: {e}")
                answer = "Please contact Admin directly for this query."

        elif llm_provider == "groq":
            try:
                client = Groq(api_key=os.getenv("GROQ_API_KEY"))
                res = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": system_prompt}]
                )
                answer = res.choices[0].message.content
            except Exception as e:
                print(f"Groq error: {e}")
                answer = "Please contact Admin directly for this query."

        # 6. Validate Response
        if not answer or len(answer.strip()) < 5:
            answer = "Please contact Admin directly for this query."

        end_time = time.time()
        response_time_ms = int((end_time - start_time) * 1000)

        # Mock confidence score based on retrieval success
        confidence_score = 0.85 if docs else 0.0

        return {
            "answer": answer,
            "sources": [doc.page_content for doc in docs],
            "intent": intent,
            "sentiment": sentiment,
            "response_time_ms": response_time_ms,
            "confidence_score": confidence_score
        }
