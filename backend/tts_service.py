import os
import tempfile
import base64
import requests
from typing import Optional
from dotenv import load_dotenv

# Ensure environment variables are loaded from the parent directory if run from inside backend folder
parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
if os.path.exists(parent_env):
    load_dotenv(parent_env)
else:
    load_dotenv()

def normalize_lang(lang: str) -> str:
    if not lang:
        return "en"
    lang = lang.lower().strip()
    if "hinglish" in lang or "hi" in lang:
        return "hi"
    if "gujlish" in lang or "gu" in lang:
        return "gu"
    if "tamil" in lang or "ta" in lang:
        return "ta"
    if "telugu" in lang or "te" in lang:
        return "te"
    if "kannada" in lang or "kn" in lang:
        return "kn"
    if "malayalam" in lang or "ml" in lang:
        return "ml"
    if "bengali" in lang or "bn" in lang:
        return "bn"
    if "marathi" in lang or "mr" in lang:
        return "mr"
    if "punjabi" in lang or "pa" in lang:
        return "pa"
    return "en"

def synthesize_speech(text: str, language: str) -> str:
    """
    Synthesize text to speech and return the local path of the generated audio file (.mp3).
    Supports:
    1. Sarvam AI TTS (bulbul:v3 premium voices for Indian regional languages)
    2. Bhashini API (Govt of India translation/speech portal)
    3. Google Cloud TTS (Neural2/Wavenet voices)
    4. gTTS (Google Translate TTS - Free developer fallback)
    
    Configurable via TTS_PROVIDER in .env:
    - 'sarvam': Force Sarvam AI Text-to-Speech API.
    - 'bhashini': Force Bhashini API.
    - 'google': Force Google Cloud Text-to-Speech API.
    - 'gtts': Force free gTTS fallback.
    - 'auto': Automatically use Sarvam (if key exists), then Bhashini (if keys exist), then Google Cloud (if key exists), then gTTS (fallback).
    """
    lang_code = normalize_lang(language)
    
    # Create a temporary file path
    temp_dir = tempfile.gettempdir()
    output_filename = f"tts_{os.urandom(8).hex()}.mp3"
    output_path = os.path.join(temp_dir, output_filename)
    
    tts_provider = os.getenv("TTS_PROVIDER", "auto").lower().strip()
    print(f"DEBUG: TTS Request received. Provider configuration: '{tts_provider}', Language normalized to: '{lang_code}'")

    # 1. Helper function for Sarvam AI TTS API
    def try_sarvam() -> Optional[str]:
        sarvam_api_key = os.getenv("SARVAM_API_KEY")
        if not sarvam_api_key:
            if tts_provider == "sarvam":
                raise ValueError(
                    "Error: TTS_PROVIDER is set to 'sarvam' but SARVAM_API_KEY is missing from .env."
                )
            print("DEBUG: SARVAM_API_KEY not configured. Skipping Sarvam AI TTS.")
            return None

        try:
            print(f"DEBUG: Connecting to Sarvam AI TTS API for language={lang_code}...")
            
            # Map normalized lang_code to Sarvam target_language_code
            sarvam_lang_map = {
                "hi": "hi-IN",
                "gu": "gu-IN",
                "en": "en-IN",
                "ta": "ta-IN",
                "te": "te-IN",
                "kn": "kn-IN",
                "ml": "ml-IN",
                "bn": "bn-IN",
                "mr": "mr-IN",
                "pa": "pa-IN",
            }
            target_lang = sarvam_lang_map.get(lang_code, "en-IN")
            
            # Default speaker is shubh. Can customize via env SARVAM_SPEAKER
            speaker = os.getenv("SARVAM_SPEAKER", "shubh")
            
            url = "https://api.sarvam.ai/text-to-speech"
            payload = {
                "text": text,
                "target_language_code": target_lang,
                "speaker": speaker,
                "speech_sample_rate": 24000,
                "output_audio_codec": "mp3"
            }
            headers = {
                "api-subscription-key": sarvam_api_key,
                "Content-Type": "application/json"
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            if response.status_code == 200:
                res_data = response.json()
                audios = res_data.get("audios")
                if audios and len(audios) > 0:
                    audio_content = audios[0]
                    with open(output_path, "wb") as f:
                        f.write(base64.b64decode(audio_content))
                    print(f"DEBUG: Sarvam AI TTS successfully synthesized audio file: {output_path}")
                    return output_path
                else:
                    error_msg = "Sarvam TTS response did not contain 'audios' list"
                    print(f"WARNING: {error_msg}")
                    if tts_provider == "sarvam":
                        raise RuntimeError(error_msg)
            else:
                error_msg = f"Sarvam TTS API responded with status {response.status_code}: {response.text}"
                print(f"WARNING: {error_msg}")
                if tts_provider == "sarvam":
                    raise RuntimeError(error_msg)
        except Exception as e:
            print(f"WARNING: Sarvam AI TTS execution failed: {e}")
            if tts_provider == "sarvam":
                raise e
        return None

    # 2. Helper function for Bhashini TTS API
    def try_bhashini() -> Optional[str]:
        bhashini_api_key = os.getenv("BHASHINI_API_KEY")
        bhashini_user_id = os.getenv("BHASHINI_USER_ID")
        # Optional custom settings for Bhashini
        bhashini_url = os.getenv("BHASHINI_INFERENCE_URL", "https://meity-auth.ulcacognitive.org/v1/pipeline/compute")
        bhashini_gender = os.getenv("BHASHINI_VOICE_GENDER", "female")
        
        if not bhashini_api_key or not bhashini_user_id:
            if tts_provider == "bhashini":
                raise ValueError(
                    "Error: TTS_PROVIDER is set to 'bhashini' but BHASHINI_API_KEY or BHASHINI_USER_ID is missing from .env."
                )
            print("DEBUG: Bhashini API keys not configured. Skipping Bhashini TTS.")
            return None

        try:
            print(f"DEBUG: Connecting to Bhashini API at {bhashini_url} for language={lang_code}...")
            headers = {
                "Content-Type": "application/json",
                "userID": bhashini_user_id,
                "ulcaApiKey": bhashini_api_key
            }
            # Custom Authorization header if needed by some Bhashini variants
            bhashini_auth = os.getenv("BHASHINI_AUTHORIZATION")
            if bhashini_auth:
                headers["Authorization"] = bhashini_auth
            
            payload = {
                "pipelineTasks": [
                    {
                        "taskType": "tts",
                        "config": {
                            "language": {
                                "sourceLanguage": lang_code
                            },
                            "gender": bhashini_gender
                        }
                    }
                ],
                "inputData": {
                    "input": [
                        {
                            "source": text
                        }
                    ]
                }
            }
            
            response = requests.post(bhashini_url, json=payload, headers=headers, timeout=10)
            if response.status_code == 200:
                res_data = response.json()
                try:
                    audio_content = res_data["pipelineResponse"][0]["audio"][0]["audioContent"]
                    with open(output_path, "wb") as f:
                        f.write(base64.b64decode(audio_content))
                    print(f"DEBUG: Bhashini TTS successfully synthesized audio file: {output_path}")
                    return output_path
                except Exception as parse_err:
                    error_msg = f"Failed to parse Bhashini response: {parse_err}. Response data: {res_data}"
                    print(f"WARNING: {error_msg}")
                    if tts_provider == "bhashini":
                        raise RuntimeError(error_msg)
            else:
                error_msg = f"Bhashini API responded with status {response.status_code}: {response.text}"
                print(f"WARNING: {error_msg}")
                if tts_provider == "bhashini":
                    raise RuntimeError(error_msg)
        except Exception as e:
            print(f"WARNING: Bhashini TTS execution failed: {e}")
            if tts_provider == "bhashini":
                raise e
        return None

    # 3. Helper function for Google Cloud TTS API
    def try_google() -> Optional[str]:
        google_api_key = os.getenv("GOOGLE_API_KEY")
        if not google_api_key:
            if tts_provider == "google":
                raise ValueError(
                    "Error: TTS_PROVIDER is set to 'google' but GOOGLE_API_KEY is missing from .env."
                )
            print("DEBUG: GOOGLE_API_KEY not configured. Skipping Google Cloud TTS.")
            return None

        try:
            print(f"DEBUG: Connecting to Google Cloud Text-to-Speech API for language={lang_code}...")
            
            # Default premium voice mappings
            voice_map = {
                "hi": {"languageCode": "hi-IN", "name": "hi-IN-Neural2-A"}, # Hindi (Neural2)
                "gu": {"languageCode": "gu-IN", "name": "gu-IN-Wavenet-A"}, # Gujarati (Wavenet)
                "en": {"languageCode": "en-IN", "name": "en-IN-Neural2-A"}, # Indian English (Neural2)
                "ta": {"languageCode": "ta-IN", "name": "ta-IN-Wavenet-A"}, # Tamil (Wavenet)
                "te": {"languageCode": "te-IN", "name": "te-IN-Wavenet-A"}, # Telugu (Wavenet)
                "kn": {"languageCode": "kn-IN", "name": "kn-IN-Wavenet-A"}, # Kannada (Wavenet)
                "ml": {"languageCode": "ml-IN", "name": "ml-IN-Wavenet-A"}, # Malayalam (Wavenet)
                "bn": {"languageCode": "bn-IN", "name": "bn-IN-Wavenet-A"}, # Bengali (Wavenet)
                "mr": {"languageCode": "mr-IN", "name": "mr-IN-Wavenet-A"}, # Marathi (Wavenet)
                "pa": {"languageCode": "pa-IN", "name": "pa-IN-Wavenet-A"}, # Punjabi (Wavenet)
            }
            
            # Allow custom voice override via env variables
            env_voice_name = os.getenv(f"GOOGLE_VOICE_NAME_{lang_code.upper()}")
            if env_voice_name:
                voice_config = {"languageCode": f"{lang_code}-IN", "name": env_voice_name}
            else:
                voice_config = voice_map.get(lang_code, {"languageCode": "en-IN", "name": "en-IN-Neural2-A"})
            
            url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={google_api_key}"
            payload = {
                "input": {"text": text},
                "voice": voice_config,
                "audioConfig": {"audioEncoding": "MP3"}
            }
            
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code == 200:
                res_data = response.json()
                audio_content = res_data.get("audioContent")
                if audio_content:
                    with open(output_path, "wb") as f:
                        f.write(base64.b64decode(audio_content))
                    print(f"DEBUG: Google Cloud TTS successfully synthesized audio file: {output_path}")
                    return output_path
                else:
                    error_msg = "Google TTS response did not contain 'audioContent'"
                    print(f"WARNING: {error_msg}")
                    if tts_provider == "google":
                        raise RuntimeError(error_msg)
            else:
                error_msg = f"Google TTS API responded with status {response.status_code}: {response.text}"
                print(f"WARNING: {error_msg}")
                if tts_provider == "google":
                    raise RuntimeError(error_msg)
        except Exception as e:
            print(f"WARNING: Google Cloud TTS execution failed: {e}")
            if tts_provider == "google":
                raise e
        return None

    # 4. Helper function for gTTS (Google Translate TTS - Free)
    def try_gtts() -> str:
        print(f"DEBUG: Using free gTTS engine for language={lang_code}...")
        try:
            from gtts import gTTS
            tts = gTTS(text=text, lang=lang_code, slow=False)
            tts.save(output_path)
            print(f"DEBUG: Free gTTS audio file generated at: {output_path}")
            return output_path
        except Exception as e:
            print(f"ERROR: Free gTTS failed: {e}")
            raise RuntimeError(f"Speech synthesis failed using gTTS: {e}")

    # --- Execution Logic Based on Provider Selection ---
    
    # Case A: Explicitly forced Sarvam AI
    if tts_provider == "sarvam":
        path = try_sarvam()
        if path:
            return path
        raise RuntimeError("Speech synthesis failed with Sarvam forced provider.")

    # Case B: Explicitly forced Bhashini
    elif tts_provider == "bhashini":
        path = try_bhashini()
        if path:
            return path
        raise RuntimeError("Speech synthesis failed with Bhashini forced provider.")
        
    # Case C: Explicitly forced Google Cloud TTS
    elif tts_provider == "google":
        path = try_google()
        if path:
            return path
        raise RuntimeError("Speech synthesis failed with Google Cloud forced provider.")
        
    # Case D: Explicitly forced free gTTS
    elif tts_provider == "gtts":
        return try_gtts()
        
    # Case E: Auto fallback detection (Default)
    elif tts_provider == "auto" or not tts_provider:
        # 1. Try Sarvam AI first if API key is present
        try:
            path = try_sarvam()
            if path:
                return path
        except Exception as e:
            print(f"WARNING: Auto-mode Sarvam failed, attempting next fallback: {e}")

        # 2. Try Bhashini if credentials exist
        try:
            path = try_bhashini()
            if path:
                return path
        except Exception as e:
            print(f"WARNING: Auto-mode Bhashini failed, attempting next fallback: {e}")
            
        # 3. Try Google Cloud TTS if key exists
        try:
            path = try_google()
            if path:
                return path
        except Exception as e:
            print(f"WARNING: Auto-mode Google Cloud TTS failed, attempting next fallback: {e}")
            
        # 4. Fallback to free gTTS
        return try_gtts()
        
    else:
        # Invalid provider value specified
        print(f"WARNING: Invalid TTS_PROVIDER '{tts_provider}' specified in .env. Defaulting to auto-detection mode.")
        # Fallback to auto logic
        try:
            path = try_sarvam()
            if path:
                return path
        except Exception:
            pass
        try:
            path = try_bhashini()
            if path:
                return path
        except Exception:
            pass
        try:
            path = try_google()
            if path:
                return path
        except Exception:
            pass
        return try_gtts()
