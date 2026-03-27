# WhaleHQ v6.0 — Complete Setup Guide

## Prerequisites
- Node.js 20+
- Python 3.11+
- MongoDB 7+
- Zerodha trading account with API access
- Telegram account (for alerts)

---

## Installation

### Step 1 — Clone and Install
```bash
git clone <your-repo>
cd whalehq

# Python
cd python-engine
pip install -r requirements.txt
cd ..

# Node.js
cd node-server
npm install
cd ..

# Frontend
cd frontend
npm install
cd ..



------------------------------------------------------
```
Step 2 — Configure Environment
bash
# python-engine/.env
CAPITAL=500000
NODE_SERVER_URL=http://localhost:4000
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# node-server/.env
PORT=4000
MONGO_URI=mongodb://localhost:27017/whalehq
JWT_SECRET=your_secret_min_32_chars
FRONTEND_URL=http://localhost:3000

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
Step 3 — Start Services
bash
# Terminal 1: MongoDB
mongod --dbpath ./data

# Terminal 2: Node Server
cd node-server && npm run dev

# Terminal 3: Python Engine
cd python-engine && python main.py

# Terminal 4: Frontend
cd frontend && npm run dev
Step 4 — First Time Setup
Open http://localhost:3000
Register your account
Go to Settings → Zerodha → Add API credentials
Complete Zerodha OAuth login
Go to Settings → Telegram → Setup bot
Test Telegram: python engines/telegram_setup_guide.py
Set capital in Settings → General
Enable Auto Trading when ready
Daily Routine
Every Morning (Before 09:15 IST)
Re-authenticate Zerodha (token expires daily)
Go to Settings → Zerodha → Update Zerodha Credentials
Paste fresh request token
Check system status on dashboard
Enable Auto Trading at 09:10
During Market (09:15 - 15:30)
Monitor dashboard
Watch Telegram alerts
DO NOT manually override trailing positions
Emergency exit available if needed
After Market (15:30+)
Review daily summary on Stats tab
Check Telegram daily summary
Update month classification if needed
Important Warnings
⚠️ PAPER TRADE FIRST — Run with Auto Trading OFF
for at least 2-4 weeks before going live

⚠️ OI DATA — NSE chain data is best effort.
Institutional OI in Crores is approximated.
For precise data, subscribe to Sensibull Pro

⚠️ NEVER OVERRIDE T3 TRAIL — The trailing
position is where 60% of profits live

⚠️ ZERODHA TOKEN — Must re-login every morning.
System will not trade without valid token


----------------------

🐍 STEP 2 — Python Engine Setup
bash
# Navigate to python engine
cd python-engine

# Create virtual environment (RECOMMENDED)
python -m venv venv

# Activate virtual environment
# Windows (Git Bash):
source venv/Scripts/activate

# Windows (CMD):
venv\Scripts\activate.bat

# Windows (PowerShell):
venv\Scripts\Activate.ps1

# You should see (venv) in terminal now ✅

# Install all packages
pip install -r requirements.txt

# Verify key packages installed
pip show requests
pip show python-dotenv
pip show pytz
pip show pymongo


---------------------------

# Start everything (copy-paste these)

# Terminal 1 - MongoDB
mongod

# Terminal 2 - Node Server
cd "D:/Dharmik Nexa/whalehq_project/node-server"
npm run dev

# Terminal 3 - Python Engine
cd "D:/Dharmik Nexa/whalehq_project/python-engine"
source venv/Scripts/activate
python main.py

# Terminal 4 - Frontend
cd "D:/Dharmik Nexa/whalehq_project/frontend"
npm run dev

# Open browser
# http://localhost:3000