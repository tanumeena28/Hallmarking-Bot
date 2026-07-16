# Hallmarking-Bot

An enterprise-grade, full-stack AI platform designed to automate inquiries, verify regulations, and capture business leads for Indian jewelers, gold refineries, and hallmarking centers.

The platform consists of a **FastAPI backend**, a **React admin management dashboard**, and a **React Native mobile app (Expo)** — fully integrated with the **WhatsApp Business API** via Twilio.

---

## Overview

The Hallmarking Bot bridges the gap between BIS (Bureau of Indian Standards) hallmarking regulations and everyday users — jewelers, refineries, and consumers — through a conversational AI interface accessible via WhatsApp, web, and mobile. It combines Retrieval-Augmented Generation (RAG), multilingual voice support, and computer vision to deliver accurate, real-time compliance guidance while capturing actionable business leads for sales teams.

---

## Key Features

- **Multilingual RAG Chatbot** — Answers user queries based on BIS hallmarking regulations, gold purity standards, and custom user-uploaded manuals. Supports native scripts (Hindi/Devanagari, Tamil, Gujarati, etc.)
- **Voice Message Support** — Transcribes spoken audio queries (STT) via Groq Whisper and synthesizes realistic, native-sounding Indian language voice replies (TTS) via Sarvam AI
- **WhatsApp Vision Integration** — Allows WhatsApp users to upload images of hallmarks, jewelry, or documents; analyzed using the Llama-3.2-11B-Vision model on Groq
- **AI Self-Correction Loop** — An automated reinforcement learning cache: when a user gives negative feedback on a response, a background worker uses Llama to correct the answer and stores it in a semantic cache (`feedback_corrections`), preventing repeated mistakes
- **Website URL Ingestion** — Admins can paste webpage links (e.g., BIS official portal pages); the backend crawls, cleans (via BeautifulSoup), and re-indexes the content into the vector database
- **Auto-Lead Capture** — Analyzes conversation intent to automatically capture potential business leads (e.g., interest in testing equipment or assay bookings) for the sales team
- **Live Spot Gold/Silver Rates** — A daily scheduled scraper feeds live commodity rates to the mobile app dashboard

---

## Technology Stack

### Backend (API Server & AI Engine)
| Category | Technology |
|---|---|
| Core | Python 3.11, FastAPI, Uvicorn |
| Orchestration | LangChain |
| LLM Provider | Groq API (`llama-3.3-70b-versatile`, `llama-3.2-11b-vision-preview`) |
| Embeddings & Vector DB | Hugging Face API (`sentence-transformers/all-MiniLM-L6-v2`), ChromaDB |
| Databases | PostgreSQL (Production) / SQLite (Development), SQLAlchemy ORM, Alembic migrations |
| Integrations | Twilio WhatsApp API, Sarvam AI Voice API, Groq Whisper (STT) |

### Admin Management Portal
| Category | Technology |
|---|---|
| Core | React, TypeScript, Vite |
| Styling | Vanilla CSS (dark blue palette matching BIS branding) |
| Icons | Lucide React |

### Mobile Application
| Category | Technology |
|---|---|
| Core | React Native, TypeScript, Expo SDK |
| Security | Secure Store (JWT authentication token management) |
| Audio | expo-av (voice message recording) |

### Infrastructure & Deployment
| Category | Technology |
|---|---|
| Containerization | Docker, Docker Compose |
| Reverse Proxy & SSL | Caddy Server (automatic SSL certificate management) |

---

## How It Works

1. A user sends a message (text, voice, or image) via WhatsApp, the web dashboard, or the mobile app.
2. The FastAPI backend receives the request and classifies intent (query, feedback, or lead signal).
3. For knowledge queries, the RAG pipeline retrieves relevant context from ChromaDB and generates a response via the Groq LLM.
4. For voice messages, audio is transcribed via Groq Whisper, processed through the same pipeline, then converted back to speech via Sarvam AI.
5. For images, the Llama Vision model analyzes the uploaded photo (e.g., a hallmark stamp) and returns an interpretation.
6. If a user marks a response as unhelpful, the self-correction worker regenerates and caches an improved answer for future queries.
7. Detected business intent (e.g., interest in assay services) is logged as a lead and surfaced on the admin dashboard.

---

## Repository Structure

```
├── backend/                  # FastAPI python backend
│   ├── alembic/               # Database migration history
│   ├── main.py                 # Main API endpoints & router setup
│   ├── bot.py                   # Bot request parsing & personalization
│   ├── rag_pipeline.py     # Vector lookup & LLM response generator
│   ├── data_pipeline.py    # Documents/web parser & ChromaDB indexer
│   ├── embeddings.py       # Resilient HuggingFace Embeddings connector
│   ├── self_correction.py # Auto-learning loop logic
│   └── requirements.txt   # Python backend dependencies
├── management-ui/         # Vite + React Admin Dashboard
│   ├── src/
│   │   ├── pages/               # Dashboard, Leads, Users, Knowledge Base
│   │   └── config.ts           # Server configuration
│   └── package.json      # Node dependencies
├── mobile/                        # React Native (Expo) Mobile App
│   ├── src/
│   │   └── screens/            # Login, Registration, Chat, Gold Rates
│   ├── app.json                 # Expo application configuration
│   └── package.json          # Mobile packages
├── docker-compose.yml         # Development docker file
├── docker-compose.prod.yml # Production docker orchestration
├── Caddyfile                          # Caddy reverse proxy config (SSL)
└── README.md                    # Project documentation
```

---

## Local Setup Guide

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (or SQLite for local dev)

### 1. Environment Configuration

Create a `.env` file in the root directory:

```ini
# Database configuration
DB_PASSWORD=your_secure_password

# JWT Authentication secret
JWT_SECRET=your_jwt_secret_key

# Groq LLM API Key
GROQ_API_KEY=gsk_your_groq_api_key

# Hugging Face token (for cloud-based embeddings)
HUGGINGFACEHUB_API_TOKEN=hf_your_huggingface_token

# Sarvam AI Key (for Indian voice synthesis)
SARVAM_API_KEY=sk_your_sarvam_api_key

# Twilio credentials (for WhatsApp bot webhook)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886  # Sandbox or live number
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload
```

### 3. Admin Dashboard Setup

```bash
cd management-ui
npm install
npm run dev
```

### 4. Mobile App Setup

```bash
cd mobile
npm install
npx expo start
```

### 5. Docker Deployment (Recommended for Production)

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## Roadmap

- [ ] Expand vernacular language support to additional Indian regional languages
- [ ] Add analytics dashboard for query trends and lead conversion tracking
- [ ] Integrate an additional payment gateway for assay booking confirmations

---

## Contributing

Contributions are welcome! Please open an issue to discuss proposed changes before submitting a pull request.

---

## License

This project is proprietary and developed for internal use at NCH Group. Add your organization's actual license terms here before making the repository public.

---

## Contact

For queries or support, reach out via the repository's issue tracker.
