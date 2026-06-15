#!/bin/bash
# NCH Hallmarking Bot - WSL Ubuntu Deployment Script
set -e

echo "============================================="
echo "  NCH Hallmarking Bot - Docker WSL Deployment"
echo "============================================="
echo ""

# 1. Update system packages
echo "[1/4] Updating package registries..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl iptables git

# 2. Install Docker CE Engine
echo "[2/4] Installing Docker CE Engine (Free/Open Source)..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER

# Start and enable docker service on boot
sudo service docker start
sudo update-rc.d docker defaults

# 3. Install Docker Compose v2
echo "[3/4] Installing Docker Compose..."
sudo apt install -y docker-compose-v2

# 4. Clone or pull code repository
echo "[4/4] Fetching latest application code..."
if [ -d "Hallmarking-Bot" ]; then
    echo "Hallmarking-Bot folder already exists. Pulling updates..."
    cd Hallmarking-Bot
    git pull
else
    git clone https://github.com/tanumeena28/Hallmarking-Bot.git
    cd Hallmarking-Bot
fi

echo ""
echo "=========================================================="
echo "    DOCKER & DEPENDENCIES INSTALLED SUCCESSFULLY!"
echo "=========================================================="
echo "Next steps to go Live:"
echo "1. Run: 'nano .env' to set your API keys (Sarvam AI, Groq, Twilio, DB Password, etc.)."
echo "2. Run: 'nano Caddyfile' and update it with your domains:"
echo "   - admin.hallmarkingcentre.in"
echo "   - bot.hallmarkingcentre.in"
echo "3. Run: 'docker compose -f docker-compose.prod.yml up -d --build'"
echo "4. Seed DB by calling: 'curl -X POST http://localhost:8000/setup'"
echo "5. Seed Vectors by calling: 'curl -X POST http://localhost:8000/setup/ingest'"
echo "=========================================================="
echo "Please restart your terminal session or run 'newgrp docker' to run docker commands without sudo."
