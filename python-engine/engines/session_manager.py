"""
Session Manager
Handles daily session reset and error recovery
Runs at 09:15 every trading day
"""

from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field
from utils.logger import setup_logger
from utils.time_utils import now_ist, is_between, is_after
from models.session_data import (
    MarketState, Direction, SystemMode, ActivePosition
)
import requests
import time

logger = setup_logger("SessionManager")


@dataclass
class SessionState:
    """Complete session state"""
    date: str = ""
    capital: float = 0.0   # Fetched from Node.js /api/system/state at startup

    # Session metrics
    trades_today: int = 0
    daily_pnl: float = 0.0
    consecutive_sl_hits: int = 0
    consecutive_wins: int = 0

    # IB scoring
    ib_scored: bool = False
    ib_score_time: str = ""

    # Market state
    market_state: MarketState = MarketState.UNKNOWN
    system_mode: SystemMode = SystemMode.STANDBY
    direction: Direction = Direction.NO_TRADE

    # Position tracking
    active_positions: list = field(default_factory=list)
    straddle_position: Optional[dict] = None

    # Flip tracking
    flip_detected_at: Optional[datetime] = None

    # Month settings
    is_choppy_month: bool = False
    is_trend_month: bool = False

    # Error tracking
    api_error_count: int = 0
    last_api_error: str = ""
    order_retry_count: int = 0


class SessionManager:

    def __init__(self, config, node_server_url: str):
        self.config = config
        self.node_server_url = node_server_url
        self.state = SessionState()
        self.http = requests.Session()
        self.http.headers.update({
            "X-Internal-Key": "whalehq-python-engine",
            "Content-Type": "application/json"
        })

        # Initialize with today's date
        self.state.date = now_ist().strftime("%Y-%m-%d")
        # Capital is loaded from Node.js DB on first state sync — NOT hardcoded
        self.state.capital = config.CAPITAL if config.CAPITAL > 0 else 0.0

    # ─────────────────────────────────────────────
    # SESSION RESET
    # ─────────────────────────────────────────────
    def reset_for_new_session(self):
        """
        Complete reset at 09:15 every trading day
        Called by main loop at start of market hours
        """
        today = now_ist().strftime("%Y-%m-%d")

        # Don't reset if already reset today
        if self.state.date == today and self.state.ib_scored:
            return

        logger.info("=" * 60)
        logger.info(f"SESSION RESET — {today}")
        logger.info("=" * 60)

        # Preserve capital (updated from previous session)
        preserved_capital = self.state.capital
        preserved_choppy = self.state.is_choppy_month
        preserved_trend = self.state.is_trend_month

        # Full reset
        self.state = SessionState()
        self.state.date = today
        self.state.capital = preserved_capital
        self.state.is_choppy_month = preserved_choppy
        self.state.is_trend_month = preserved_trend

        logger.info(
            f"Session reset complete | "
            f"Capital: ₹{preserved_capital:,.0f} | "
            f"Date: {today}"
        )

        # Notify Node.js of session reset
        self._notify_session_reset(today)

    def should_reset(self) -> bool:
        """Check if session needs reset"""
        today = now_ist().strftime("%Y-%m-%d")
        return self.state.date != today

    # ─────────────────────────────────────────────
    # DAILY LOSS LIMIT CHECK
    # ─────────────────────────────────────────────
    def check_daily_loss_limit(self, is_expiry: bool = False) -> bool:
        """
        Returns True if daily loss limit hit
        Normal: 6% | Expiry: 4% | Event: 8%
        """
        if self.state.system_mode == SystemMode.EVENT:
            limit = self.config.EVENT_DAILY_LOSS_LIMIT
        elif is_expiry:
            limit = self.config.EXPIRY_DAILY_LOSS_LIMIT
        else:
            limit = self.config.DAILY_LOSS_LIMIT

        loss_threshold = -1 * self.state.capital * limit

        if self.state.daily_pnl <= loss_threshold:
            logger.warning(
                f"DAILY LOSS LIMIT HIT | "
                f"P&L: ₹{self.state.daily_pnl:,.0f} | "
                f"Limit: {limit*100}% = ₹{loss_threshold:,.0f}"
            )
            self.state.system_mode = SystemMode.SHUTDOWN
            return True

        return False

    def update_pnl(self, pnl_change: float):
        """Update daily P&L and capital"""
        self.state.daily_pnl += pnl_change

        logger.info(
            f"P&L Update: {'+' if pnl_change >= 0 else ''}₹{pnl_change:,.0f} | "
            f"Daily Total: {'+' if self.state.daily_pnl >= 0 else ''}₹{self.state.daily_pnl:,.0f}"
        )

    def update_capital_end_of_day(self):
        """Update capital with today's P&L at EOD"""
        self.state.capital += self.state.daily_pnl
        logger.info(
            f"EOD Capital Update: ₹{self.state.capital:,.0f} "
            f"(+₹{self.state.daily_pnl:,.0f})"
        )

    # ─────────────────────────────────────────────
    # ERROR RECOVERY
    # ─────────────────────────────────────────────
    def handle_api_failure(
            self,
            error: Exception,
            context: str
    ) -> bool:
        """
        Handle API failures with retry logic
        Returns True if should retry, False if give up
        """
        self.state.api_error_count += 1
        self.state.last_api_error = str(error)

        logger.error(
            f"API Failure [{context}]: {error} | "
            f"Count: {self.state.api_error_count}"
        )

        # Under 5 errors — retry
        if self.state.api_error_count <= 5:
            wait_seconds = min(
                5 * self.state.api_error_count, 30
            )
            logger.info(
                f"Retrying in {wait_seconds}s..."
            )
            time.sleep(wait_seconds)
            return True

        # Too many errors — critical alert
        logger.critical(
            f"CRITICAL: {self.state.api_error_count} "
            f"consecutive API failures. "
            f"Manual intervention may be needed."
        )
        self._send_critical_alert(
            f"API FAILURE: {context} — {str(error)}"
        )
        return False

    def handle_order_rejection(
            self,
            signal,
            rejection_reason: str
    ) -> dict:
        """
        Handle Zerodha order rejection
        Common reasons and recovery actions
        """
        self.state.order_retry_count += 1

        logger.error(
            f"ORDER REJECTED: {rejection_reason} | "
            f"Retry: {self.state.order_retry_count}"
        )

        # Map rejection reasons to actions
        rejection_actions = {
            "insufficient funds": {
                "action": "REDUCE_SIZE",
                "reduce_by": 0.5,
                "message": "Reducing position size due to insufficient funds"
            },
            "margin": {
                "action": "REDUCE_SIZE",
                "reduce_by": 0.5,
                "message": "Reducing size due to margin requirement"
            },
            "outside market hours": {
                "action": "SKIP",
                "message": "Order outside market hours — skip"
            },
            "instrument not found": {
                "action": "CHECK_SYMBOL",
                "message": "Check instrument symbol — possible expiry issue"
            },
            "order limit exceeded": {
                "action": "WAIT",
                "wait_seconds": 60,
                "message": "Order limit hit — waiting 60s"
            },
        }

        rejection_lower = rejection_reason.lower()
        for key, response in rejection_actions.items():
            if key in rejection_lower:
                logger.info(f"Recovery: {response['message']}")
                return response

        # Unknown rejection
        return {
            "action": "SKIP",
            "message": f"Unknown rejection: {rejection_reason}"
        }

    def handle_partial_fill(
            self,
            ordered_lots: int,
            filled_lots: int,
            signal
    ) -> dict:
        """
        Handle partial fills — adjust position tracking
        """
        logger.warning(
            f"PARTIAL FILL: Ordered {ordered_lots} lots | "
            f"Filled {filled_lots} lots"
        )

        if filled_lots == 0:
            return {
                "action": "CANCEL_TRACK",
                "message": "Zero fill — not tracking position"
            }

        fill_ratio = filled_lots / ordered_lots

        # Recalculate tranches based on actual fill
        from config import config
        import math

        t1_lots = max(1, math.floor(filled_lots * 0.40))
        t2_lots = max(0, math.floor(filled_lots * 0.30))
        t3_lots = filled_lots - t1_lots - t2_lots

        return {
            "action": "ADJUST_POSITION",
            "actual_lots": filled_lots,
            "t1_lots": t1_lots,
            "t2_lots": t2_lots,
            "t3_lots": t3_lots,
            "fill_ratio": fill_ratio,
        }

    def handle_network_loss(self) -> bool:
        """
        Handle network connectivity loss
        Returns True when connection restored
        """
        logger.critical("NETWORK LOSS DETECTED")
        retry_count = 0
        max_retries = 20

        while retry_count < max_retries:
            retry_count += 1
            wait = min(5 * retry_count, 60)

            logger.info(
                f"Network recovery attempt {retry_count}/{max_retries} "
                f"in {wait}s..."
            )
            time.sleep(wait)

            try:
                resp = self.http.get(
                    f"{self.node_server_url}/health",
                    timeout=5
                )
                if resp.status_code == 200:
                    logger.info("Network restored!")
                    self.state.api_error_count = 0
                    return True
            except Exception:
                continue

        logger.critical(
            "Network not restored after max retries. "
            "Manual intervention required."
        )
        self._send_critical_alert(
            "NETWORK LOST — Manual intervention required"
        )
        return False

    def emergency_close_all(self, reason: str):
        """
        Emergency: close all positions immediately
        Called when system detects unrecoverable state
        """
        logger.critical(
            f"EMERGENCY CLOSE ALL — Reason: {reason}"
        )

        try:
            response = self.http.post(
                f"{self.node_server_url}/api/orders/emergency-close",
                json={"reason": reason},
                timeout=30
            )
            response.raise_for_status()
            logger.critical("Emergency close sent to Node.js")

            self.state.active_positions = []
            self.state.system_mode = SystemMode.SHUTDOWN

        except Exception as e:
            logger.critical(
                f"EMERGENCY CLOSE FAILED: {e} — "
                f"Manual action required on Zerodha!"
            )
            self._send_critical_alert(
                f"EMERGENCY CLOSE FAILED — Manual action needed! "
                f"Reason: {reason}"
            )

    # ─────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────
    def reset_api_error_count(self):
        """Reset error count on successful API call"""
        if self.state.api_error_count > 0:
            self.state.api_error_count = 0

    def record_sl_hit(self):
        self.state.consecutive_sl_hits += 1
        self.state.consecutive_wins = 0
        logger.warning(
            f"SL Hit #{self.state.consecutive_sl_hits}"
        )
        if self.state.consecutive_sl_hits >= 2:
            logger.warning(
                "2 consecutive SLs — system paused for day"
            )

    def record_win(self):
        self.state.consecutive_wins += 1
        self.state.consecutive_sl_hits = 0

    def can_trade_after_consecutive_sl(self) -> bool:
        return self.state.consecutive_sl_hits < 2

    def get_size_multiplier_after_wins(
            self,
            base_multiplier: float
    ) -> float:
        """
        After 2 consecutive wins, reduce next trade to 0.75x
        """
        if self.state.consecutive_wins >= 2:
            logger.info(
                "2 consecutive wins — "
                "next trade at 0.75x"
            )
            return min(base_multiplier, 0.75)
        return base_multiplier

    def _notify_session_reset(self, date: str):
        """Tell Node.js a new session has started"""
        try:
            self.http.post(
                f"{self.node_server_url}/api/system/session-reset",
                json={
                    "date": date,
                    "capital": self.state.capital
                },
                timeout=5
            )
        except Exception as e:
            logger.error(f"Session reset notify failed: {e}")

    def _send_critical_alert(self, message: str):
        """Send critical alert (Telegram + Node.js)"""
        try:
            self.http.post(
                f"{self.node_server_url}/api/alerts/critical",
                json={
                    "message": message,
                    "timestamp": now_ist().isoformat()
                },
                timeout=5
            )
        except Exception as e:
            logger.error(f"Critical alert send failed: {e}")