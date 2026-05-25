# Windows Server Production Deployment Guide (Hinglish)

Yeh guide aapko step-by-step batayegi ki aap apne **Windows Server** par **Hallmarking Bot** ke complete stack (FastAPI Backend, PostgreSQL Database, React Admin Dashboard, and HTTPS/SSL Reverse Proxy) ko kaise deploy kar sakte hain.

Hum Windows Server par **WSL 2 (Windows Subsystem for Linux)** aur standard **Docker Engine** ka use karenge. Yeh approach completely **free (license-free)** hai aur Linux containers ko server par high performance ke saath chalati hai.

---

## 📋 Table of Contents
1. [IT Team Checklist & Requirements](#1-it-team-checklist--requirements)
2. [Step 1: Install Virtualization & WSL 2 on Windows Server](#step-1-install-virtualization--wsl-2-on-windows-server)
3. [Step 2: Install Docker inside WSL 2 (No License Fee)](#step-2-install-docker-inside-wsl-2-no-license-fee)
4. [Step 3: Project Files Transfer & `.env` Setup](#step-3-project-files-transfer--env-setup)
5. [Step 4: Configure Domains & SSL (Caddyfile)](#step-4-configure-domains--ssl-caddyfile)
6. [Step 5: Launch the Application Stack](#step-5-launch-the-application-stack)
7. [Step 6: Database Seeding & Setup](#step-6-database-seeding--setup)
8. [Step 7: Build Mobile App APK](#step-7-build-mobile-app-apk)

---

## 1. IT Team Checklist & Requirements

Apni company ki IT/Network team ko yeh specifications aur access details provide karein:

*   **Server OS**: Windows Server 2019 ya 2022 (ya standard Windows 10/11 Pro/Enterprise testing ke liye).
*   **Virtualization**: Windows BIOS/Hyper-V virtualization setting enabled honi chahiye (Agar server cloud VM hai, toh *Nested Virtualization* enabled hona chahiye).
*   **System Specs**: Minimum 4GB RAM (8GB recommended), 2+ CPU Cores, aur 30GB free disk space.
*   **Domain & DNS Setup**: Aapki company ke domains ke do (2) A-records Server ke Public IP ki taraf point karne chahiye:
    *   `admin.yourcompany.com` (React Admin Panel ke liye)
    *   `api.yourcompany.com` (FastAPI Backend API ke liye)
*   **Firewall Ports**: Server ke security groups/firewall me **Port 80 (HTTP)** aur **Port 443 (HTTPS)** incoming traffic ke liye open hone chahiye.

---

## Step 1: Install Virtualization & WSL 2 on Windows Server

Windows Server par Linux kernel chalane ke liye WSL 2 enable karein:

1. Windows Server par **PowerShell** ko **Run as Administrator** karke open karein.
2. Virtual Machine platform aur WSL features ko enable karne ke liye yeh commands run karein:
   ```powershell
   # Enable Virtualization Features
   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   ```
3. WSL kernel install karne aur default **Ubuntu** distribution set karne ke liye yeh command run karein:
   ```powershell
   wsl --install -d Ubuntu
   ```
4. **Server ko Restart karein.**
5. Restart ke baad Ubuntu window automatic open hogi. Wahan par apna naya **Username** aur **Password** create karein (ise yaad rakhein).

---

## Step 2: Install Docker inside WSL 2 (No License Fee)

Docker Desktop ko Windows par chalane ke liye corporate license fees lagti hai. Isse bachne ke liye hum direct WSL 2 ke andar free **Docker CE Engine** install karenge:

1. Apne Windows Server par **Ubuntu** (WSL terminal) open karein.
2. System packages update karein:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
3. Docker setup script download aur run karein:
   ```bash
   sudo apt install curl iptables -y
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```
4. Apne user ko Docker group me add karein taki bin `sudo` ke docker commands chal sakein:
   ```bash
   sudo usermod -aG docker $USER
   ```
5. Docker service start aur enable karein:
   ```bash
   sudo service docker start
   # Auto-start Docker on boot inside WSL
   sudo update-rc.d docker defaults
   ```
6. **Docker Compose v2** install karein:
   ```bash
   sudo apt install docker-compose-v2 -y
   ```
7. Verify karein ki Docker sahi tarike se chal raha hai:
   ```bash
   docker --version
   docker compose version
   ```

---

## Step 3: Project Files Transfer & `.env` Setup

1. **Copy Files to Server**: Windows Server par project directory (`Hallmarking Bot Development`) ko copy karein.
2. **Access from WSL**: WSL Terminal se aap Windows files ko `/mnt/` directory ke through access kar sakte hain. Eg:
   ```bash
   # Apni project directory me navigate karein (Apna path custom adjust karein)
   cd "/mnt/c/Users/Tanu Meena/OneDrive/Desktop/Hallmarking Bot Development"
   ```
3. **Setup Production Environment (`.env`)**:
   Ek `.env` file root folder me create karein (apne correct keys enter karein):
   ```ini
   # Database Configurations
   DB_PASSWORD=apna_secure_password_yahan_likhein

   # JWT Config
   JWT_SECRET=apna_random_long_secret_key

   # LLM & AI Models
   LLM_PROVIDER=groq
   GROQ_API_KEY=gsk_your_groq_api_key_yahan_likhein
   
   # Cloud-based Embeddings for low RAM usage
   HUGGINGFACEHUB_API_TOKEN=hf_your_huggingface_api_token

   # Sarvam AI for TTS & STT (Text-to-Speech & Speech-to-Text)
   SARVAM_API_KEY=sk_bszu8cm4_y18Uld8IXvNNtPO8aIHpIrxP

   # Twilio Whatsapp API (WhatsApp Webhooks ke liye)
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_WHATSAPP_NUMBER=whatsapp:+91yournumber
   
   # Optional: Gold Rate API key (Agar metals verification active rakhna ho)
   METALS_API_KEY=your_metals_key
   ```

---

## Step 4: Configure Domains & SSL (Caddyfile)

Production build ke liye automatic SSL certificate generate karne ke liye Caddy configuration file edit karenge.

1. Root directory me maujood [Caddyfile](file:///c:/Users/Tanu%20Meena/OneDrive/Desktop/Hallmarking%20Bot%20Development/Caddyfile) ko edit karein aur `yourdomain.com` ko apni company ke real domains se replace karein:
   ```caddy
   # Replace with your company subdomains
   admin.mycompany.com {
       reverse_proxy management-ui:80
   }

   api.mycompany.com {
       reverse_proxy backend:8000
   }
   ```

---

## Step 5: Launch the Application Stack

Ab hum pure app stack ko (PostgreSQL, FastAPI Backend, React Dashboard, Caddy Server) WSL ke through start karenge:

1. WSL Terminal me run karein:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
2. Containers running status check karein:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```
   Aapko 4 containers `running` state me dekhne chahiye:
   *   `db` (Postgres Database)
   *   `backend` (FastAPI API server)
   *   `management-ui` (React static host)
   *   `caddy` (Let's Encrypt SSL provider aur Routing proxy)

Caddy automatically Let's Encrypt se secure SSL certificates generate karega. Ab aap apne domains (`https://admin.mycompany.com` aur `https://api.mycompany.com`) ko browser me secure connection ke sath browse kar payenge.

---

## Step 6: Database Seeding & Setup

Naya database empty hota hai. System me super-admin account create karne aur PDF/Knowledge documents ko ingest karne ke liye niche likhi commands WSL terminal ya Windows Command Prompt se run karein:

1. **Create Super Admin User** (`admin@nch.in` / password: `admin123`):
   ```bash
   curl -X POST https://api.mycompany.com/setup
   ```
2. **Ingest Documents (Knowledge Base vector build)**:
   ```bash
   curl -X POST https://api.mycompany.com/setup/ingest
   ```

Super admin credentials create hone ke baad aap `https://admin.mycompany.com` par login karke dashboard access kar payenge.

---

## Step 7: Build Mobile App APK

Apne mobile app ko Windows Server API ke saath test karne ke liye:

1. [mobile/app.config.js](file:///c:/Users/Tanu%20Meena/OneDrive/Desktop/Hallmarking%20Bot%20Development/mobile/app.config.js) open karein aur line 4 ko edit karke apne Windows Server API domain par map karein:
   ```javascript
   apiUrl: process.env.API_URL || 'https://api.mycompany.com',
   ```
2. Local system me mobile directory me terminal open karke build run karein:
   ```bash
   eas build -p android --profile preview
   ```
   Build complete hone ke baad Expo download link provide karega jisse aap APK file directly device par download aur install karke live Windows Server API database ke saath verify kar sakte hain!
