# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Request, Depends
# pyrefly: ignore [missing-import]
from fastapi.responses import Response
# pyrefly: ignore [missing-import]
from twilio.twiml.messaging_response import MessagingResponse
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from database import get_db
from models import User, QueryLog
from bot import HallmarkingBot
import requests
import os
import tempfile
from groq import Groq

router = APIRouter()
bot = HallmarkingBot()

@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    incoming_msg = form.get('Body', '').strip()
    sender = form.get('From', '')
    phone = sender.replace('whatsapp:', '')
    
    num_media = int(form.get('NumMedia', '0'))
    
    if not incoming_msg and num_media == 0:
        return Response(content="", media_type="application/xml")
        
    # Handle Media (Audio/Image)
    if num_media > 0:
        media_url = form.get('MediaUrl0')
        content_type = form.get('MediaContentType0')
        
        if content_type.startswith('audio/'):
            # Download audio and transcribe
            response = requests.get(media_url)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name
                
            wav_path = tmp_path.replace(".ogg", ".wav")
            try:
                # Convert OGG to WAV using soundfile (doesn't need ffmpeg)
                import soundfile as sf
                data, samplerate = sf.read(tmp_path)
                sf.write(wav_path, data, samplerate)
                
                client = Groq(api_key=os.getenv("GROQ_API_KEY"))
                with open(wav_path, "rb") as audio_file:
                    transcription = client.audio.transcriptions.create(
                        file=(f"voice.wav", audio_file.read()),
                        model="whisper-large-v3",
                        response_format="text"
                    )
                incoming_msg = transcription
                print(f"DEBUG - Transcription: {incoming_msg}")
            except Exception as e:
                print(f"STT Error: {e}")
                incoming_msg = "Error: Could not transcribe audio"
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                if os.path.exists(wav_path):
                    os.unlink(wav_path)

                    
        elif content_type.startswith('image/'):
            # Use Groq Vision model to analyze image
            try:
                client = Groq(api_key=os.getenv("GROQ_API_KEY"))
                completion = client.chat.completions.create(
                    model="llama-3.2-11b-vision-preview",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Analyze this image and answer any questions related to hallmarking, gold, or jewelry. If the user sent a text message with the image, answer that question based on the image."},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": media_url,
                                    },
                                },
                            ],
                        }
                    ],
                )
                incoming_msg = completion.choices[0].message.content
            except Exception as e:
                print(f"Vision Error: {e}")
                incoming_msg = "Error: Could not analyze image"



    # Find or create user by phone number
    user = db.query(User).filter(User.phone == phone).first()
    if not user:
        user = User(
            phone=phone,
            name="WhatsApp User",
            email=f"{phone}@whatsapp.com",
            hashed_password="whatsapp_mock_password",
            role="jeweler"
        )

        db.add(user)
        db.commit()
        db.refresh(user)


    # State 1: Check if user has domain set
    if not user.company_type:
        # Check if they are replying with a choice
        if incoming_msg in ["1", "Jeweler"]:
            user.company_type = "jeweler"
            user.role = "jeweler"
            db.commit()
            reply = "Dhanyawad! Aapne 'Jeweler' select kiya hai. Ab aap apna sawal pooch sakte hain."
        elif incoming_msg in ["2", "Hallmarking Centre"]:
            user.company_type = "hallmarking_centre"
            user.role = "hallmarking_centre"
            db.commit()
            reply = "Dhanyawad! Aapne 'Hallmarking Centre' select kiya hai. Ab aap apna sawal pooch sakte hain."
        elif incoming_msg in ["3", "Refinery"]:
            user.company_type = "refinery"
            user.role = "refinery"
            db.commit()
            reply = "Dhanyawad! Aapne 'Refinery' select kiya hai. Ab aap apna sawal pooch sakte hain."
        else:
            reply = "Namaste! Apna chat shuru karne se pehle, please batayein ki aap kis domain se hain:\n1. Jeweler\n2. Hallmarking Centre\n3. Refinery\n\nPlease 1, 2 ya 3 likh kar jawab dein."
        
        twiml = MessagingResponse()
        twiml.message(reply)
        return Response(content=str(twiml), media_type="application/xml")

    # If domain is set, check if this is a feedback response
    # We look for the last query log for this user without feedback
    last_log = db.query(QueryLog).filter(QueryLog.user_id == user.id).order_by(QueryLog.timestamp.desc()).first()
    
    if last_log and last_log.feedback_rating is None:
        # Check if message is a feedback
        if incoming_msg.lower() in ["yes", "ha", "haan", "satisfied", "achha"]:
            last_log.feedback_rating = 1
            db.commit()
            twiml = MessagingResponse()
            twiml.message("Feedback ke liye dhanyawad!")
            return Response(content=str(twiml), media_type="application/xml")
        elif incoming_msg.lower() in ["no", "nahi", "na", "unsatisfied", "bekar", "wrong", "galat"]:
            last_log.feedback_rating = -1
            db.commit()
            
            # TRIGGER AI SELF-CORRECTION LOOP
            from self_correction import trigger_self_correction
            trigger_self_correction(last_log.id, db)

            twiml = MessagingResponse()
            twiml.message("Hum koshish karenge ki agli baar behtar jawab dein. Feedback ke liye dhanyawad! Is answer ko background me improve kiya ja raha hai.")
            return Response(content=str(twiml), media_type="application/xml")

    # If not feedback, proceed with regular chat
    bot_result = bot.ask(
        query=incoming_msg,
        user_id=user.id,
        db=db,
        platform='whatsapp'
    )


    # Send reply via Twilio REST API (more reliable than TwiML in sandbox)
    from twilio.rest import Client
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")


    twilio_client = Client(account_sid, auth_token)
    
    full_reply = bot_result['reply']

    
    try:
        message = twilio_client.messages.create(
            from_='whatsapp:+14155238886',
            body=full_reply,
            to=f'whatsapp:{phone}'
        )
        print(f"DEBUG - Message sent via API: {message.sid}")
    except Exception as e:
        print(f"DEBUG - Twilio API Error: {e}")
    
    # Return empty response to Twilio webhook
    return Response(content="<Response/>", media_type="application/xml")








