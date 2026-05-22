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
        if any(w in text for w in ["rate", "price", "cost", "value", "bhav", "bhau", "dhara", "gold", "silver", "chandi"]):
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

    def refine_fuzzy_transcript(self, transcript: str) -> str:
        if not transcript or len(transcript.strip()) < 2:
            return transcript
            
        refine_prompt = f"""You are an expert audio transcription corrector for Indian gold hallmarking, jewelry, and refinery domains.
The user spoke a query, and it was transcribed using speech-to-text, which might contain errors (e.g. "hu id" instead of "HUID", "gold read" instead of "gold rate", "ex-ref" instead of "XRF", "b i s" instead of "BIS").

Analyze this transcript: "{transcript}"
Identify the intended topic (e.g. BIS registration, HUID, Gold Rates, XRF testing, Fire Assay) and output a clean, grammatically correct search query in the same language. 
Only output the corrected query, nothing else."""
        
        try:
            from groq import Groq
            client = Groq(api_key=os.getenv("GROQ_API_KEY"))
            res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": refine_prompt}],
                max_tokens=100,
                temperature=0.1
            )
            refined = res.choices[0].message.content.strip()
            # Clean quotes if any
            if refined.startswith('"') and refined.endswith('"'):
                refined = refined[1:-1]
            print(f"DEBUG - Fuzzy Audio Refiner: '{transcript}' -> '{refined}'")
            return refined
        except Exception as e:
            print(f"Error refining fuzzy transcript: {e}")
            return transcript

    def generate_response(self, query: str, user=None, db=None) -> dict:
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

        # 0. Check Auto-Correction Cache First
        if db:
            from models import FeedbackCorrection
            import numpy as np
            from deep_translator import GoogleTranslator
            
            corrections = db.query(FeedbackCorrection).all()
            if corrections:
                try:
                    # 1. Translate user query to English
                    try:
                        query_en = GoogleTranslator(source='auto', target='en').translate(query)
                    except Exception as te:
                        print(f"Translation error for query: {te}")
                        query_en = query
                    
                    # 2. Translate all cached questions to English
                    corr_questions_en = []
                    for c in corrections:
                        try:
                            q_en = GoogleTranslator(source='auto', target='en').translate(c.question)
                        except Exception:
                            q_en = c.question
                        corr_questions_en.append(q_en)
                    
                    # 3. Embed user query in English
                    query_emb = self.embeddings.embed_query(query_en)
                    
                    # 4. Embed cached questions in English
                    corr_embs = self.embeddings.embed_documents(corr_questions_en)
                    
                    # Compute cosine similarities
                    similarities = []
                    q_norm = np.linalg.norm(query_emb)
                    for c_emb in corr_embs:
                        c_norm = np.linalg.norm(c_emb)
                        if q_norm > 0 and c_norm > 0:
                            sim = np.dot(query_emb, c_emb) / (q_norm * c_norm)
                        else:
                            sim = 0
                        similarities.append(sim)
                        
                    # Find highest similarity
                    if similarities:
                        max_idx = np.argmax(similarities)
                        max_sim = similarities[max_idx]
                        
                        # Threshold (0.65 for English-translated MiniLM embeddings is safe and matches equivalent phrasings)
                        if max_sim >= 0.65:
                            best_corr = corrections[max_idx]
                            print(f"DEBUG - Found semantic auto-corrected answer (Similarity: {max_sim:.4f}) for query: {query}")
                            end_time = time.time()
                            return {
                                "answer": best_corr.corrected_answer,
                                "sources": ["Feedback Self-Correction Database"],
                                "intent": "self_corrected",
                                "sentiment": "neutral",
                                "response_time_ms": int((end_time - start_time) * 1000),
                                "confidence_score": 1.0
                            }
                except Exception as e:
                    print(f"Error checking semantic correction cache: {e}")

        # chit-chat greeting check
        chitchat_prompt = f"""You are the Hallmarking Bot, a friendly AI assistant for Indian gold hallmarking.
Analyze the user message: "{query}"

If this message is a general greeting, farewell, expression of gratitude, or casual small talk (such as "hi", "hello", "bye", "tata", "thank you", "thanks", "kaise ho", "good morning"), respond directly and politely in the same language and script (e.g. reply in Hinglish if the query is Hinglish, Hindi script for Hindi, Gujarati script for Gujarati). Keep it short.
Otherwise, if the message asks for information, definitions, explanations, procedures, or help regarding gold rates, hallmarking, BIS rules, refineries, XRF machines, jewelry, or any domain-related topic, you MUST output exactly: "PROCESS_QUERY"
Do NOT treat informational queries or requests for introduction/explanation as casual greetings.

Your response:"""
        
        try:
            client = Groq(api_key=os.getenv("GROQ_API_KEY"))
            res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": chitchat_prompt}],
                max_tokens=150,
                temperature=0.7
            )
            chitchat_reply = res.choices[0].message.content.strip()
            if chitchat_reply != "PROCESS_QUERY" and len(chitchat_reply) > 0:
                # Remove quotes if LLM added them
                if chitchat_reply.startswith('"') and chitchat_reply.endswith('"'):
                    chitchat_reply = chitchat_reply[1:-1]
                end_time = time.time()
                return {
                    "answer": chitchat_reply,
                    "sources": ["Chit-Chat Handler"],
                    "intent": "chitchat",
                    "sentiment": "neutral",
                    "response_time_ms": int((end_time - start_time) * 1000),
                    "confidence_score": 1.0
                }
        except Exception as e:
            print(f"Error checking chit-chat: {e}")

        # Translate to English using LLM for extremely high accuracy across all Indian languages/scripts (including Romanized Hinglish/Telugu/Gujlish)
        try:
            translate_prompt = f"""You are a translator. Translate the following user message to clean, standard English search query.
User message may be in English, Hindi, Hinglish, Gujarati, Telugu, or any other Indian language (either in native script or Roman letters).
Do not add any explanation or preamble. Only output the English translation.

User message: "{query}"
English translation:"""
            client = Groq(api_key=os.getenv("GROQ_API_KEY"))
            res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": translate_prompt}],
                max_tokens=100,
                temperature=0.1
            )
            search_query = res.choices[0].message.content.strip()
            # Clean quotes if any
            if search_query.startswith('"') and search_query.endswith('"'):
                search_query = search_query[1:-1]
            print(f"DEBUG - LLM Translation: '{query}' -> '{search_query}'")
        except Exception as e:
            print(f"Error in LLM translation: {e}")
            from deep_translator import GoogleTranslator
            try:
                search_query = GoogleTranslator(source='auto', target='en').translate(query)
                print(f"DEBUG - Google Translation fallback: '{query}' -> '{search_query}'")
            except Exception as te:
                print(f"Translation fallback error: {te}")
                search_query = query

        # 1. Classify Intent on the translated English query for high accuracy
        intent = self.classify_intent(search_query)

        # 2. Analyze Sentiment
        sentiment = self.analyze_sentiment(query)

        # Fetch dynamic live gold/silver rates from DB if intent is gold_rate
        gold_context = ""
        if intent == "gold_rate" and db:
            try:
                from models import GoldRate
                latest_rate = db.query(GoldRate).order_by(GoldRate.date.desc()).first()
                if latest_rate:
                    gold_context = f"""
Current Live Gold and Silver Rates (updated at {latest_rate.updated_at}):
- 24K Gold Rate: Rs. {latest_rate.rate_per_gram_24k} per gram
- 22K Gold Rate: Rs. {latest_rate.rate_per_gram_22k} per gram
- Silver Rate: Rs. {latest_rate.rate_per_gram_silver if latest_rate.rate_per_gram_silver else "N/A"} per gram
Source: {latest_rate.source}
"""
            except Exception as ge:
                print(f"Error fetching gold rate: {ge}")

        # 3. ChromaDB Search
        docs = self.vectorstore.similarity_search(search_query, k=5)
        context = "\n\n".join([doc.page_content for doc in docs])
        if gold_context:
            context = gold_context + "\n\n" + context

        # 4. Build System Prompt
        user_context = get_user_context_prompt(user)
        
        system_prompt = f"""You are the Hallmarking Bot, an expert assistant for hallmarking centres, jewelers, and gold refineries in India.
Answer ONLY based on the provided context below.
If the answer is not in the context, say exactly: "Please contact Admin directly for this query."
Be professional, accurate, and helpful.

CRITICAL: You MUST reply in the EXACT SAME language and script as the user's question.
- If the question is in English, reply in English.
- If the question is in Hindi, reply in Hindi (Devanagari script).
- If the question is in Hinglish (Hindi in English letters, e.g. 'HUID kya hota hai'), reply in Hinglish.
- If the question is in Gujarati, reply in Gujarati (Gujarati script).
- If the question is in Gujlish (Gujarati in English letters), reply in Gujlish.
- If the question is in Telugu, reply in Telugu (Telugu script).
- If the question is in Tamil, reply in Tamil (Tamil script).
- This applies to all 22 Indian languages (Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Odia, Malayalam, Punjabi, Sanskrit, Assamese, Maithili, Santali, Kashmiri, Nepali, Konkani, Dogri, Manipuri, Bodo, etc.). Always match the user's vocabulary, alphabet, and script.

Do NOT ask the user if they are satisfied with the response or append any satisfaction verification question (like "Kya aap satisfied hain?"). Simply answer the query directly and politely.

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
