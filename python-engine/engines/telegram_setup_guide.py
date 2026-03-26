"""
Telegram Bot Setup Guide
Run this file once to test your Telegram setup
python engines/telegram_setup_guide.py
"""

import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()


def setup_guide():
    print("\n" + "=" * 50)
    print("WHALEHQ — TELEGRAM SETUP GUIDE")
    print("=" * 50)

    print("""
STEP 1: Create Telegram Bot
─────────────────────────────
1. Open Telegram
2. Search for @BotFather
3. Send: /newbot
4. Choose a name: e.g. "WhaleHQ Alerts"
5. Choose a username: e.g. "whalehq_alerts_bot"
6. Copy the TOKEN it gives you

STEP 2: Get Your Chat ID
─────────────────────────────
1. Search for @userinfobot on Telegram
2. Send any message to it
3. It will reply with your user ID
4. That ID is your CHAT_ID
   (for groups: add bot to group, 
    send message, check updates for chat_id)

STEP 3: Add to .env
─────────────────────────────
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=987654321
    """)

    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        print("❌ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env")
        print("   Please set them and run this script again")
        return

    print(f"✅ Token found: {token[:20]}...")
    print(f"✅ Chat ID found: {chat_id}")
    print("\nSending test message...")

    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": (
                    "🐋 *WhaleHQ v6.0 Test*\n\n"
                    "✅ Telegram is connected!\n"
                    "You will receive trade alerts here.\n\n"
                    "Ready to trade! 🚀"
                ),
                "parse_mode": "Markdown",
            },
            timeout=10,
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("ok"):
            print("✅ Test message sent successfully!")
            print("   Check your Telegram for the message")
        else:
            print(f"❌ Failed: {result}")

    except Exception as e:
        print(f"❌ Error: {e}")
        print("   Check your token and chat_id are correct")


if __name__ == "__main__":
    setup_guide()