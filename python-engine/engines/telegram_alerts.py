"""
Telegram Alert System
Sends real-time notifications for:
- Trade entries
- T1/T2/T3 exits
- SL hits
- Daily P&L summary
- Critical system alerts
"""

import requests
import os
from typing import Optional
from utils.logger import setup_logger
from utils.time_utils import now_ist
from models.session_data import Direction

logger = setup_logger("TelegramAlerts")


class TelegramAlerts:

    def __init__(self):
        self.bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        self.chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
        self.enabled = bool(self.bot_token and self.chat_id)
        self.base_url = (
            f"https://api.telegram.org/bot{self.bot_token}"
        )

        if self.enabled:
            logger.info(
                f"Telegram alerts enabled | "
                f"Chat: {self.chat_id}"
            )
        else:
            logger.warning(
                "Telegram alerts DISABLED — "
                "set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID"
            )

    # ─────────────────────────────────────────────
    # TRADE ENTRY ALERT
    # ─────────────────────────────────────────────
    def send_trade_entry(
            self,
            direction: str,
            option_type: str,
            strike: int,
            premium: float,
            lots: int,
            iae_score: int,
            market_state: str,
            t1_target: float,
            t2_target: float,
            sl_premium: float,
            capital_deployed: float,
            risk_amount: float,
            entry_window: str
    ):
        direction_emoji = "🟢" if direction == "BULL" else "🔴"
        direction_arrow = "▲" if direction == "BULL" else "▼"

        message = (
            f"{direction_emoji} *TRADE ENTRY — WhaleHQ v6.0*\n"
            f"{'─' * 30}\n"
            f"*{direction_arrow} {direction} {option_type}*  "
            f"`{strike}`\n\n"
            f"📊 *IAE Score:* `{iae_score}/8`\n"
            f"📈 *Market State:* `{market_state}`\n"
            f"⏰ *Window:* `{entry_window}`\n\n"
            f"💰 *Entry Premium:* `₹{premium}`\n"
            f"📦 *Lots:* `{lots}`\n"
            f"💵 *Deployed:* `₹{capital_deployed:,.0f}`\n"
            f"⚠️ *Risk:* `₹{risk_amount:,.0f}`\n\n"
            f"🎯 *Targets:*\n"
            f"  T1: `₹{t1_target}` (+40%)\n"
            f"  T2: `₹{t2_target}` (+80%)\n"
            f"  SL: `₹{sl_premium}` (-32%)\n\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # T1 EXIT ALERT
    # ─────────────────────────────────────────────
    def send_t1_exit(
            self,
            direction: str,
            option_type: str,
            strike: int,
            entry_premium: float,
            exit_premium: float,
            lots: int,
            pnl: float
    ):
        pnl_emoji = "✅" if pnl >= 0 else "❌"

        message = (
            f"{pnl_emoji} *T1 EXIT — +40% Target Hit*\n"
            f"{'─' * 30}\n"
            f"*{direction} {option_type} {strike}*\n\n"
            f"📌 *Entry:* `₹{entry_premium}`\n"
            f"📌 *Exit:* `₹{exit_premium}`\n"
            f"📦 *Lots:* `{lots}`\n\n"
            f"💰 *T1 P&L:* "
            f"`{'+' if pnl >= 0 else ''}₹{pnl:,.0f}`\n\n"
            f"⏳ T2 and T3 still running...\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # T2 EXIT ALERT
    # ─────────────────────────────────────────────
    def send_t2_exit(
            self,
            direction: str,
            option_type: str,
            strike: int,
            entry_premium: float,
            exit_premium: float,
            lots: int,
            pnl: float,
            t3_trail_sl: float
    ):
        message = (
            f"✅ *T2 EXIT — +80% Target Hit*\n"
            f"{'─' * 30}\n"
            f"*{direction} {option_type} {strike}*\n\n"
            f"📌 *Entry:* `₹{entry_premium}`\n"
            f"📌 *Exit:* `₹{exit_premium}`\n"
            f"📦 *Lots:* `{lots}`\n\n"
            f"💰 *T2 P&L:* `+₹{pnl:,.0f}`\n\n"
            f"🔄 *T3 Trail Active*\n"
            f"  Trail SL: `₹{t3_trail_sl:.2f}`\n"
            f"  Let it run! 🚀\n\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # T3 TRAIL EXIT ALERT
    # ─────────────────────────────────────────────
    def send_t3_trail_exit(
            self,
            direction: str,
            option_type: str,
            strike: int,
            entry_premium: float,
            peak_premium: float,
            exit_premium: float,
            lots: int,
            t3_pnl: float,
            total_pnl: float
    ):
        message = (
            f"🏁 *T3 TRAIL EXIT — Trade Complete*\n"
            f"{'─' * 30}\n"
            f"*{direction} {option_type} {strike}*\n\n"
            f"📌 *Entry:* `₹{entry_premium}`\n"
            f"📈 *Peak:* `₹{peak_premium}`\n"
            f"📌 *Trail Exit:* `₹{exit_premium}`\n"
            f"📦 *T3 Lots:* `{lots}`\n\n"
            f"💰 *T3 P&L:* `+₹{t3_pnl:,.0f}`\n"
            f"💰 *TOTAL P&L:* `+₹{total_pnl:,.0f}`\n\n"
            f"🎯 Trade completed successfully!\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # SL HIT ALERT
    # ─────────────────────────────────────────────
    def send_sl_hit(
            self,
            direction: str,
            option_type: str,
            strike: int,
            entry_premium: float,
            exit_premium: float,
            lots: int,
            pnl: float,
            sl_type: str,
            consecutive_sl: int
    ):
        warning = ""
        if consecutive_sl >= 2:
            warning = (
                "\n\n⛔ *2nd CONSECUTIVE SL*\n"
                "System paused for rest of day."
            )

        message = (
            f"🔴 *SL HIT — {sl_type}*\n"
            f"{'─' * 30}\n"
            f"*{direction} {option_type} {strike}*\n\n"
            f"📌 *Entry:* `₹{entry_premium}`\n"
            f"📌 *SL Exit:* `₹{exit_premium}`\n"
            f"📦 *Lots:* `{lots}`\n\n"
            f"💸 *Loss:* `₹{pnl:,.0f}`\n"
            f"📊 *Consecutive SLs:* `{consecutive_sl}`"
            f"{warning}\n\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # DAILY P&L SUMMARY
    # ─────────────────────────────────────────────
    def send_daily_summary(
            self,
            date: str,
            trades: int,
            wins: int,
            losses: int,
            total_pnl: float,
            capital_start: float,
            capital_end: float,
            market_state: str,
            iae_score: int,
            best_trade_pnl: float = 0,
            worst_trade_pnl: float = 0
    ):
        pnl_pct = (
            (total_pnl / capital_start * 100)
            if capital_start > 0 else 0
        )
        pnl_emoji = "🟢" if total_pnl >= 0 else "🔴"
        win_rate = (
            (wins / trades * 100) if trades > 0 else 0
        )

        message = (
            f"📊 *DAILY SUMMARY — WhaleHQ v6.0*\n"
            f"{'─' * 30}\n"
            f"📅 *Date:* `{date}`\n"
            f"📈 *Market:* `{market_state}` | "
            f"IAE: `{iae_score}/8`\n\n"
            f"📋 *Trades:* `{trades}` "
            f"({wins}W / {losses}L)\n"
            f"🎯 *Win Rate:* `{win_rate:.0f}%`\n\n"
            f"{pnl_emoji} *Day P&L:* "
            f"`{'+' if total_pnl >= 0 else ''}"
            f"₹{total_pnl:,.0f}` "
            f"({'+' if pnl_pct >= 0 else ''}"
            f"{pnl_pct:.2f}%)\n\n"
            f"💼 *Capital:*\n"
            f"  Start: `₹{capital_start:,.0f}`\n"
            f"  End:   `₹{capital_end:,.0f}`\n"
        )

        if best_trade_pnl > 0:
            message += (
                f"\n🏆 *Best Trade:* "
                f"`+₹{best_trade_pnl:,.0f}`\n"
            )

        if worst_trade_pnl < 0:
            message += (
                f"📉 *Worst Trade:* "
                f"`₹{worst_trade_pnl:,.0f}`\n"
            )

        message += (
            f"\n🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # SYSTEM STARTUP ALERT
    # ─────────────────────────────────────────────
    def send_system_startup(
            self,
            capital: float,
            expiry: str,
            dte: int
    ):
        message = (
            f"🚀 *WhaleHQ v6.0 Started*\n"
            f"{'─' * 30}\n"
            f"💼 *Capital:* `₹{capital:,.0f}`\n"
            f"📅 *Expiry:* `{expiry}` (DTE: {dte})\n"
            f"⏰ *Time:* "
            f"`{now_ist().strftime('%H:%M:%S IST')}`\n\n"
            f"✅ All engines initialized\n"
            f"👁️ Monitoring market..."
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # IAE SCORE ALERT
    # ─────────────────────────────────────────────
    def send_iae_score(
            self,
            iae_score: int,
            market_state: str,
            direction: str,
            breakdown: dict,
            can_trade: bool
    ):
        if iae_score < 4:
            return  # Don't spam for no-trade sessions

        engines_text = ""
        engine_map = {
            "isIb": f"IS/IB ({breakdown.get('isIb', 0)}/2)",
            "pureOI": f"Pure OI ({breakdown.get('pureOI', 0)}/2)",
            "oiDelta": f"OI Delta ({breakdown.get('oiDelta', 0)}/1)",
            "volX": f"VolX ({breakdown.get('volX', 0)}/1)",
            "gamma": f"Gamma ({breakdown.get('gamma', 0)}/1)",
            "mp": f"MP ({breakdown.get('mp', 0)}/1)",
            "tre": f"TRE ({breakdown.get('tre', 0)}/1)",
        }

        for key, label in engine_map.items():
            score = breakdown.get(key, 0)
            tick = "✅" if score > 0 else "❌"
            engines_text += f"  {tick} {label}\n"

        direction_emoji = (
            "🟢▲" if direction == "BULL"
            else "🔴▼" if direction == "BEAR"
            else "⚪—"
        )

        trade_status = (
            "⚡ TRADE SIGNAL ACTIVE"
            if can_trade
            else "🚫 NO TRADE"
        )

        message = (
            f"📊 *IB SCORE — WhaleHQ v6.0*\n"
            f"{'─' * 30}\n"
            f"🎯 *IAE Score:* `{iae_score}/8`\n"
            f"📈 *State:* `{market_state}`\n"
            f"📌 *Direction:* {direction_emoji} "
            f"`{direction}`\n\n"
            f"*Engine Breakdown:*\n"
            f"{engines_text}\n"
            f"{'─' * 20}\n"
            f"*{trade_status}*\n\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # CRITICAL ALERT
    # ─────────────────────────────────────────────
    def send_critical_alert(self, message: str):
        text = (
            f"🚨 *CRITICAL ALERT — WhaleHQ*\n"
            f"{'─' * 30}\n"
            f"{message}\n\n"
            f"⚠️ *Immediate action may be required!*\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )
        self._send(text, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # DAILY LOSS LIMIT ALERT
    # ─────────────────────────────────────────────
    def send_daily_loss_limit_hit(
            self,
            daily_pnl: float,
            limit_pct: float,
            capital: float
    ):
        message = (
            f"⛔ *DAILY LOSS LIMIT HIT*\n"
            f"{'─' * 30}\n"
            f"💸 *Loss:* `₹{abs(daily_pnl):,.0f}`\n"
            f"📊 *Limit:* `{limit_pct*100:.0f}%`\n"
            f"💼 *Capital:* `₹{capital:,.0f}`\n\n"
            f"🔒 System SHUTDOWN for today.\n"
            f"No more trades will be placed.\n\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # EVENT MODE ALERT
    # ─────────────────────────────────────────────
    def send_event_mode_activated(
            self,
            event_name: str,
            ivp: float,
            straddle_entry: dict = None
    ):
        straddle_text = ""
        if straddle_entry:
            straddle_text = (
                f"\n🎯 *Straddle Entered:*\n"
                f"  Strike: `{straddle_entry.get('strike')}`\n"
                f"  CE: `₹{straddle_entry.get('ce_premium')}`\n"
                f"  PE: `₹{straddle_entry.get('pe_premium')}`\n"
                f"  Lots: `{straddle_entry.get('lots')}`"
            )

        message = (
            f"🌊 *EVENT MODE ACTIVATED*\n"
            f"{'─' * 30}\n"
            f"📅 *Event:* `{event_name}`\n"
            f"📊 *IVP:* `{ivp:.0f}`\n\n"
            f"⚡ Straddle + Momentum strategy active\n"
            f"📌 Normal IAE rules suspended"
            f"{straddle_text}\n\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # STRADDLE EXIT ALERT
    # ─────────────────────────────────────────────
    def send_straddle_lock(
            self,
            leg: str,
            entry_premium: float,
            lock_premium: float,
            lots: int,
            pnl: float
    ):
        message = (
            f"🔒 *STRADDLE LEG LOCKED — {leg}*\n"
            f"{'─' * 30}\n"
            f"📌 *Entry:* `₹{entry_premium}`\n"
            f"📌 *Lock:* `₹{lock_premium}` (+100%)\n"
            f"📦 *Lots:* `{lots}`\n"
            f"💰 *Profit Locked:* `+₹{pnl:,.0f}`\n\n"
            f"🔄 Other leg now runs FREE!\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )

        self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # TEST ALERT
    # ─────────────────────────────────────────────
    def send_test(self):
        """Send test message to verify setup"""
        message = (
            f"✅ *WhaleHQ Telegram Test*\n"
            f"{'─' * 30}\n"
            f"Bot is connected and working!\n"
            f"You will receive trade alerts here.\n\n"
            f"🕐 {now_ist().strftime('%H:%M:%S IST')}"
        )
        return self._send(message, parse_mode="Markdown")

    # ─────────────────────────────────────────────
    # CORE SEND METHOD
    # ─────────────────────────────────────────────
    def _send(
            self,
            message: str,
            parse_mode: str = "Markdown"
    ) -> bool:
        if not self.enabled:
            logger.debug(
                f"Telegram disabled — skipping: "
                f"{message[:50]}..."
            )
            return False

        try:
            resp = requests.post(
                f"{self.base_url}/sendMessage",
                json={
                    "chat_id": self.chat_id,
                    "text": message,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
                timeout=10
            )
            resp.raise_for_status()
            logger.debug("Telegram alert sent")
            return True

        except Exception as e:
            logger.error(f"Telegram send failed: {e}")
            return False