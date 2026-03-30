"""
Expiry Manager
Handles all expiry-related calculations using dynamic data from Node.js/Zerodha:
- Store current weekly expiry
- Calculate DTE (Days to Expiry)
- Determine if today is expiry day
- Get NIFTY option instrument symbols
"""

from datetime import datetime, date, timedelta
from typing import Optional, List
from utils.logger import setup_logger
from utils.time_utils import now_ist
import pytz

logger = setup_logger("ExpiryManager")

IST = pytz.timezone("Asia/Kolkata")


class ExpiryManager:

    def __init__(self):
        self._current_expiry = None
        self._current_dte = 0

    def set_expiry(self, expiry_date: str, dte: int):
        """Inject exact expiry from Node.js / Zerodha"""
        self._current_expiry = expiry_date
        self._current_dte = dte
        logger.info(f"Dynamic expiry set: {expiry_date} | DTE: {dte}")

    def get_current_expiry(self) -> str:
        """Returns the dynamic weekly expiry date YYYY-MM-DD"""
        if not self._current_expiry:
            # Safe fallback if asked before initialization
            return now_ist().strftime("%Y-%m-%d")
        return self._current_expiry

    def get_dte(self, expiry_date: str = None) -> int:
        """Returns the dynamic DTE"""
        return self._current_dte

    def is_expiry_day(self, expiry_date: str = None) -> bool:
        """Returns True if today is the expiry day"""
        if not expiry_date:
            expiry_date = self.get_current_expiry()

        today = now_ist().strftime("%Y-%m-%d")
        return today == expiry_date

    def is_pre_expiry_day(self) -> bool:
        """Returns True if tomorrow is expiry (DTE=1)"""
        return self.get_dte() == 1

    def get_expiry_formatted(
            self,
            expiry_date: str = None,
            format_type: str = "zerodha"
    ) -> str:
        """
        Format expiry for different uses:
        zerodha: 27FEB25 (for instrument symbol)
        display: 27 Feb 2025
        iso: 2025-02-27
        """
        if not expiry_date:
            expiry_date = self.get_current_expiry()

        dt = datetime.strptime(expiry_date, "%Y-%m-%d")

        if format_type == "zerodha":
            months = [
                "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
            ]
            day = dt.strftime("%d")
            month = months[dt.month - 1]
            year = dt.strftime("%y")
            return f"{day}{month}{year}"

        elif format_type == "display":
            return dt.strftime("%d %b %Y")

        return expiry_date

    def build_option_symbol(
            self,
            symbol: str,
            strike: int,
            option_type: str,
            expiry_date: str = None
    ) -> str:
        """
        Build NSE option trading symbol
        Format: NIFTY24JAN25000CE
        """
        if not expiry_date:
            expiry_date = self.get_current_expiry()

        expiry_formatted = self.get_expiry_formatted(
            expiry_date, "zerodha"
        )

        return f"{symbol}{expiry_formatted}{strike}{option_type}"

    def get_session_info(self) -> dict:
        """Returns complete session info based on dynamic data"""
        expiry = self.get_current_expiry()
        dte = self.get_dte(expiry)
        is_expiry = self.is_expiry_day(expiry)

        return {
            "expiry_date": expiry,
            "expiry_formatted": self.get_expiry_formatted(
                expiry, "display"
            ),
            "dte": dte,
            "is_expiry_day": is_expiry,
            "is_pre_expiry": dte == 1,
            "is_near_expiry": dte <= 2,
            "week_type": self._get_week_type(dte),
        }

    def _get_week_type(self, dte: int) -> str:
        if dte >= 4:
            return "FULL_WEEK"
        elif dte == 3:
            return "MID_WEEK"
        elif dte == 2:
            return "NEAR_EXPIRY"
        elif dte == 1:
            return "PRE_EXPIRY"
        else:
            return "EXPIRY_DAY"