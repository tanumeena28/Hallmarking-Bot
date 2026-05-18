# Project Status: NCH Hallmarking Bot Enterprise

This file summarizes the current state of the project and what has been built so far.

## Project Overview
An AI-powered Hallmarking Platform with a RAG (Retrieval-Augmented Generation) pipeline, WhatsApp integration, a management UI, and a mobile application.

## Directory Structure & Components

### 1. Backend (`/backend`)
A FastAPI-based Python backend handling the core logic.
-   `main.py`: Entry point, API endpoints (Auth, Bot, Setup).
-   `bot.py`: Core logic for the Hallmarking Bot.
-   `rag_pipeline.py`: Retrieval-Augmented Generation pipeline for answering queries based on data.
-   `whatsapp.py`: Router for WhatsApp integration.
-   `analytics.py`: Router for analytics features.
-   `auth.py`: Authentication logic (JWT, passwords).
-   `database.py` & `models.py`: Database setup and SQLAlchemy models (User, QueryLog, Lead, etc.).
-   `data_pipeline.py` & `ingest.py`: Data ingestion and processing.
-   `requirements.txt`: Python dependencies.

### 2. Management UI (`/management-ui`)
A React application for managing the platform.
-   Built with **React 19**, **TypeScript**, and **Vite**.
-   Provides the dashboard and admin interface.

### 3. Mobile App (`/mobile`)
A mobile application.
-   Built with **React Native** / **Expo** (TypeScript).
-   Contains the mobile interface for users or agents.

### 4. Frontend (`/frontend`)
-   Contains `admin` and `widget` folders. This seems to be either a static version or a separate widget component.

### 5. Configuration & Data
-   `.env` & `.env.example`: Environment variables.
-   `docker-compose.yml`: For containerizing services (like databases).
-   `mock_dataset.csv`: Sample data for testing.
