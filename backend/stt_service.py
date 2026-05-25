import os
import requests
from dotenv import load_dotenv

# Ensure environment variables are loaded
parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
if os.path.exists(parent_env):
    load_dotenv(parent_env)
else:
    load_dotenv()

def transcribe_audio(file_path: str, content_type: str = "audio/wav") -> str:
    """
    Transcribe an audio file to text.
    Supports:
    1. Sarvam AI STT API (saaras:v3 for Indian languages)
    2. Groq Whisper API (whisper-large-v3 for standard/fast transcription)
    
    Configurable via STT_PROVIDER in .env:
    - 'groq': Force Groq Whisper.
    - 'sarvam': Force Sarvam AI Speech-to-Text.
    - 'auto': Use Sarvam (if keys exist), then Groq.
    """
    stt_provider = os.getenv("STT_PROVIDER", "auto").lower().strip()
    sarvam_key = os.getenv("SARVAM_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    # 1. Try Sarvam AI
    if (stt_provider == "sarvam" or (stt_provider == "auto" and sarvam_key)):
        if not sarvam_key:
            raise ValueError("Error: STT_PROVIDER is set to 'sarvam' but SARVAM_API_KEY is missing from .env.")
        try:
            print("DEBUG: Using Sarvam AI STT (Saaras v3) for transcription...")
            url = "https://api.sarvam.ai/speech-to-text"
            headers = {"api-subscription-key": sarvam_key}
            
            # Open the audio file and send as form-data
            with open(file_path, "rb") as audio_file:
                files = {"file": (os.path.basename(file_path), audio_file, content_type)}
                data = {
                    "model": "saaras:v3",
                    "mode": "transcribe" # transcribe Mode parses Indian languages best
                }
                response = requests.post(url, headers=headers, files=files, data=data, timeout=20)
                
            if response.status_code == 200:
                res_data = response.json()
                transcript = res_data.get("transcript", "").strip()
                print(f"DEBUG: Sarvam AI STT transcribed successfully: '{transcript}'")
                return transcript
            else:
                print(f"WARNING: Sarvam STT API failed with code {response.status_code}: {response.text}")
                if stt_provider == "sarvam":
                    raise RuntimeError(f"Sarvam API failed: {response.text}")
        except Exception as e:
            print(f"WARNING: Sarvam STT failed: {e}")
            if stt_provider == "sarvam":
                raise e

    # 2. Default to Groq Whisper
    if not groq_key:
        raise ValueError("Error: Groq API Key is missing for STT fallback.")
        
    try:
        print("DEBUG: Using Groq Whisper for transcription...")
        from groq import Groq
        client = Groq(api_key=groq_key)
        with open(file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(file_path), audio_file.read()),
                model="whisper-large-v3",
                response_format="text"
            )
        return transcription.strip()
    except Exception as e:
        print(f"ERROR: Groq Whisper transcription failed: {e}")
        raise RuntimeError(f"Transcription failed: {e}")
