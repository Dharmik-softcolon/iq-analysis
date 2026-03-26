"""
Expiry Manager
Handles all expiry-related calculations:
- Get current/next weekly expiry
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
        # Manual holiday list — update each year
        # Format: "YYYY-MM-DD"
        self.nse_holidays_2026 = [
            "2026-01-26",  # Republic Day
            "2026-03-02",  # Holi
            "2026-03-30",  # Ram Navami
            "2026-04-02",  # Good Friday
            "2026-04-14",  # Dr. Ambedkar Jayanti
            "2026-04-21",  # Gudi Padwa
            "2026-05-01",  # Maharashtra Day
            "2026-08-15",  # Independence Day
            "2026-08-27",  # Ganesh Chaturthi
            "2026-10-02",  # Gandhi Jayanti
            "2026-10-13",  # Dussehra
            "2026-11-01",  # Diwali Laxmi Puja (check NSE)
            "2026-11-02",  # Diwali Balipratipada
            "2026-11-20",  # Gurunanak Jayanti
            "2026-12-25",  # Christmas
        ]

        # Cache
        self._expiry_cache = {}

    def get_current_expiry(self) -> str:
        """
        Returns the nearest weekly expiry date
        NIFTY weekly expiry = every Thursday
        If Thursday is holiday, expiry moves to Wednesday
        Returns format: YYYY-MM-DD
        """
        today = now_ist().date()
        cache_key = today.strftime("%Y-%m-%d")

        if cache_key in self._expiry_cache:
            return self._expiry_cache[cache_key]

        # Find nearest Thursday
        expiry = self._find_nearest_thursday(today)

        # Check if expiry is holiday
        expiry = self._adjust_for_holiday(expiry)

        expiry_str = expiry.strftime("%Y-%m-%d")
        self._expiry_cache[cache_key] = expiry_str

        logger.info(f"Current expiry: {expiry_str}")
        return expiry_str

    def get_next_expiry(self) -> str:
        """Returns the NEXT weekly expiry after current"""
        current = datetime.strptime(
            self.get_current_expiry(), "%Y-%m-%d"
        ).date()
        next_thursday = current + timedelta(days=7)
        next_thursday = self._adjust_for_holiday(next_thursday)
        return next_thursday.strftime("%Y-%m-%d")

    def get_dte(self, expiry_date: str = None) -> int:
        """
        Days to Expiry from today
        DTE = 0 means today is expiry
        """
        if not expiry_date:
            expiry_date = self.get_current_expiry()

        expiry = datetime.strptime(expiry_date, "%Y-%m-%d").date()
        today = now_ist().date()

        dte = (expiry - today).days
        return max(0, dte)

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

    def get_weekly_expiries(self, weeks: int = 4) -> List[str]:
        """Get next N weekly expiry dates"""
        expiries = []
        current = datetime.strptime(
            self.get_current_expiry(), "%Y-%m-%d"
        ).date()

        for i in range(weeks):
            expiry = current + timedelta(days=7 * i)
            expiry = self._adjust_for_holiday(expiry)
            expiries.append(expiry.strftime("%Y-%m-%d"))

        return expiries

    def get_session_info(self) -> dict:
        """Returns complete session info"""
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

    def _find_nearest_thursday(self, from_date: date) -> date:
        """Find the nearest Thursday on or after from_date"""
        days_ahead = 3 - from_date.weekday()  # Thursday = 3
        if days_ahead < 0:
            days_ahead += 7
        elif days_ahead == 0:
            # Today is Thursday — this IS expiry day
            pass
        return from_date + timedelta(days=days_ahead)

    def _adjust_for_holiday(self, expiry: date) -> date:
        """
        If expiry falls on NSE holiday,
        move to previous trading day
        """
        expiry_str = expiry.strftime("%Y-%m-%d")
        all_holidays = self.nse_holidays_2026

        # Keep moving back until we find a trading day
        adjusted = expiry
        while adjusted.strftime("%Y-%m-%d") in all_holidays:
            adjusted = adjusted - timedelta(days=1)
            logger.info(
                f"Expiry adjusted for holiday: "
                f"{expiry_str} → {adjusted}"
            )

        return adjusted

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