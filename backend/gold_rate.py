import os
import requests
import re
from bs4 import BeautifulSoup
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import date, datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from models import GoldRate

def fetch_and_save_gold_rate(db: Session):
    rate_24k = None
    rate_22k = None
    source = None

    try:
        # Try IBJA first
        print("Attempting to scrape IBJA...")
        res = requests.get("https://ibja.co", timeout=10)
        text = BeautifulSoup(res.text, 'html.parser').get_text()
        
        # Search for rates
        m_24k = re.search(r'Fine Gold \(999\):\s*(?:₹)?\s*(\d+)', text)
        m_22k = re.search(r'22 KT:\s*(?:₹)?\s*(\d+)', text)
        
        if m_24k:
            rate_24k = float(m_24k.group(1))
        if m_22k:
            rate_22k = float(m_22k.group(1))
            
        if rate_24k and rate_22k:
            source = "ibja"
            print(f"Scraped from IBJA: 24k={rate_24k}, 22k={rate_22k}")
    except Exception as e:
        print(f"IBJA scrape failed: {e}")

    # Fallback to metals-api if IBJA failed
    if not source:
        try:
            print("Attempting Metals-API fallback...")
            metals_api_key = os.getenv("METALS_API_KEY")
            if metals_api_key:
                res = requests.get(
                    "https://metals-api.com/api/latest",
                    params={
                        "access_key": metals_api_key,
                        "base": "INR",
                        "symbols": "XAU"
                    },
                    timeout=10
                )
                data = res.json()
                # Convert troy ounce to gram
                # 1 troy ounce = 31.1035 grams
                rate_24k = round(data['rates']['XAU'] / 31.1035, 2)
                rate_22k = round(rate_24k * 0.9167, 2)
                source = "metals-api"
                print(f"Fetched from Metals-API: 24k={rate_24k}, 22k={rate_22k}")
            else:
                print("METALS_API_KEY not set in environment.")
        except Exception as e:
            print(f"Metals-API failed: {e}")

    if not source:
        print("Both methods failed to fetch gold rate.")
        return

    # Save to DB (upsert by date)
    existing = db.query(GoldRate).filter(
        func.date(GoldRate.date) == date.today()
    ).first()

    if existing:
        existing.rate_per_gram_24k = rate_24k
        existing.rate_per_gram_22k = rate_22k
        existing.source = source
        existing.updated_at = datetime.utcnow()
    else:
        gold = GoldRate(
            rate_per_gram_24k=rate_24k,
            rate_per_gram_22k=rate_22k,
            source=source
        )
        db.add(gold)
        
    db.commit()
    print("Gold rate saved successfully.")

scheduler = BackgroundScheduler()

def start_gold_scheduler(db: Session):
    scheduler.add_job(
        fetch_and_save_gold_rate,
        'interval',
        hours=24,
        args=[db]
    )
    scheduler.start()
    print("Gold rate scheduler started.")
    # Fetch immediately on startup
    try:
        fetch_and_save_gold_rate(db)
    except Exception as e:
        print(f"Initial fetch failed: {e}")
