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
    rate_silver = None
    source = None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"
    }

    # 1. Try GoodReturns first for BOTH gold and silver
    try:
        print("Attempting to scrape GoodReturns for gold...")
        res_gold = requests.get("https://www.goodreturns.in/gold-rates/", headers=headers, timeout=10)
        soup_gold = BeautifulSoup(res_gold.text, 'html.parser')
        text_gold = soup_gold.get_text()

        pos = text_gold.lower().find("today 24 carat gold rate per gram in india")
        if pos != -1:
            sec_24 = text_gold[pos:pos+400]
            m_24 = re.search(r'Change\s+1\s*(?:Rs\.|[\u20b9])?\s*([\d,]+)', sec_24, re.IGNORECASE)
            if m_24:
                rate_24k = float(m_24.group(1).replace(',', ''))

        pos2 = text_gold.lower().find("today 22 carat gold price per gram in india")
        if pos2 != -1:
            sec_22 = text_gold[pos2:pos2+400]
            m_22 = re.search(r'Change\s+1\s*(?:Rs\.|[\u20b9])?\s*([\d,]+)', sec_22, re.IGNORECASE)
            if m_22:
                rate_22k = float(m_22.group(1).replace(',', ''))

        print("Attempting to scrape GoodReturns for silver...")
        res_silver = requests.get("https://www.goodreturns.in/silver-rates/", headers=headers, timeout=10)
        soup_silver = BeautifulSoup(res_silver.text, 'html.parser')
        text_silver = soup_silver.get_text()

        m_sil = re.search(r'price of silver in India today is\s*(?:Rs\.|[\u20b9])?\s*([\d,\.]+)\s*per gram', text_silver, re.IGNORECASE)
        if m_sil:
            rate_silver = float(m_sil.group(1).replace(',', ''))
        else:
            m_sil_alt = re.search(r'today is\s*(?:Rs\.|[\u20b9])?\s*([\d,\.]+)\s*per gram', text_silver, re.IGNORECASE)
            if m_sil_alt:
                rate_silver = float(m_sil_alt.group(1).replace(',', ''))

        if rate_24k and rate_22k and rate_silver:
            source = "goodreturns"
            print(f"Scraped from GoodReturns: 24k={rate_24k}, 22k={rate_22k}, silver={rate_silver}")
    except Exception as e:
        print(f"GoodReturns scrape failed: {e}")

    # 2. Fallback to IBJA for gold if GoodReturns failed
    if not rate_24k or not rate_22k:
        try:
            print("Attempting to scrape IBJA for gold rates...")
            res = requests.get("https://ibja.co", timeout=10)
            text = BeautifulSoup(res.text, 'html.parser').get_text()
            
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

    # 3. Fallback to metals-api for both if still missing
    if not rate_24k or not rate_22k or not rate_silver:
        try:
            print("Attempting Metals-API fallback...")
            metals_api_key = os.getenv("METALS_API_KEY")
            if metals_api_key:
                # Get Gold
                if not rate_24k or not rate_22k:
                    res_gold = requests.get(
                        "https://metals-api.com/api/latest",
                        params={"access_key": metals_api_key, "base": "INR", "symbols": "XAU"},
                        timeout=10
                    )
                    data_gold = res_gold.json()
                    rate_24k = round(data_gold['rates']['XAU'] / 31.1035, 2)
                    rate_22k = round(rate_24k * 0.9167, 2)
                    source = "metals-api"
                # Get Silver
                if not rate_silver:
                    res_sil = requests.get(
                        "https://metals-api.com/api/latest",
                        params={"access_key": metals_api_key, "base": "INR", "symbols": "XAG"},
                        timeout=10
                    )
                    data_sil = res_sil.json()
                    rate_silver = round(data_sil['rates']['XAG'] / 31.1035, 2)
                    if not source:
                        source = "metals-api"
                print(f"Fetched from Metals-API: 24k={rate_24k}, 22k={rate_22k}, silver={rate_silver}")
            else:
                print("METALS_API_KEY not set in environment.")
        except Exception as e:
            print(f"Metals-API failed: {e}")

    if not rate_24k or not rate_22k:
        print("Failed to fetch gold rates.")
        return

    # Fallback default silver rate if still None
    if rate_silver is None:
        rate_silver = 90.0 # Default fallback price per gram
        print(f"Using default fallback for silver: {rate_silver}")

    if not source:
        source = "unknown"

    # Save to DB (upsert by date)
    existing = db.query(GoldRate).filter(
        func.date(GoldRate.date) == date.today()
    ).first()

    if existing:
        existing.rate_per_gram_24k = rate_24k
        existing.rate_per_gram_22k = rate_22k
        existing.rate_per_gram_silver = rate_silver
        existing.source = source
        existing.updated_at = datetime.utcnow()
    else:
        gold = GoldRate(
            rate_per_gram_24k=rate_24k,
            rate_per_gram_22k=rate_22k,
            rate_per_gram_silver=rate_silver,
            source=source
        )
        db.add(gold)
        
    db.commit()
    print("Gold/Silver rates saved successfully.")

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
