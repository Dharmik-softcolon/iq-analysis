"""
VWAP Calculator
Computes Volume Weighted Average Price from 1-min candles
Resets at 09:15 every session
Required for MP Acceptance Engine
"""

from typing import List, Optional
from dataclasses import dataclass, field
from utils.logger import setup_logger
from utils.time_utils import now_ist
import requests

logger = setup_logger("VWAPCalculator")


@dataclass
class Candle:
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class VWAPCalculator:

    def __init__(self, node_server_url: str):
        self.node_server_url = node_server_url
        self.candles: List[Candle] = []
        self.cumulative_pv: float = 0.0   # Price × Volume
        self.cumulative_vol: float = 0.0   # Total Volume
        self.current_vwap: float = 0.0
        self.session_date: str = ""
        self.session = requests.Session()
        self.session.headers.update({
            "X-Internal-Key": "whalehq-python-engine"
        })

    def reset(self):
        """Reset VWAP at start of each session (09:15)"""
        self.candles = []
        self.cumulative_pv = 0.0
        self.cumulative_vol = 0.0
        self.current_vwap = 0.0
        self.session_date = now_ist().strftime("%Y-%m-%d")
        logger.info(
            f"VWAP reset for session: {self.session_date}"
        )

    def update(self, candle: Candle) -> float:
        """
        Update VWAP with new 1-min candle
        VWAP = Σ(Typical Price × Volume) / Σ(Volume)
        Typical Price = (High + Low + Close) / 3
        """
        # Auto-reset if new session
        today = now_ist().strftime("%Y-%m-%d")
        if today != self.session_date:
            self.reset()

        typical_price = (candle.high + candle.low + candle.close) / 3
        pv = typical_price * candle.volume

        self.cumulative_pv += pv
        self.cumulative_vol += candle.volume
        self.candles.append(candle)

        if self.cumulative_vol > 0:
            self.current_vwap = self.cumulative_pv / self.cumulative_vol

        logger.debug(
            f"VWAP updated: {self.current_vwap:.2f} | "
            f"Candle close: {candle.close} | "
            f"Volume: {candle.volume}"
        )

        return self.current_vwap

    def update_from_price(
            self,
            high: float,
            low: float,
            close: float,
            volume: int
    ) -> float:
        """
        Simplified update when full candle not available
        Uses approximate volume if not provided
        """
        if volume == 0:
            # Estimate volume from price movement
            volume = max(1000, int(abs(high - low) * 100))

        candle = Candle(
            timestamp=now_ist().isoformat(),
            open=close,
            high=high,
            low=low,
            close=close,
            volume=volume
        )
        return self.update(candle)

    def fetch_and_update(self) -> float:
        """
        Fetch latest candles from Node server
        and update VWAP
        """
        try:
            resp = self.session.get(
                f"{self.node_server_url}/api/market/candles",
                params={"symbol": "NIFTY", "interval": "minute"},
                timeout=5
            )
            resp.raise_for_status()
            data = resp.json()

            candles = data.get("candles", [])
            if not candles:
                return self.current_vwap

            # Reset and recalculate from all candles today
            self.reset()
            for c in candles:
                candle = Candle(
                    timestamp=c.get("timestamp", ""),
                    open=float(c.get("open", 0)),
                    high=float(c.get("high", 0)),
                    low=float(c.get("low", 0)),
                    close=float(c.get("close", 0)),
                    volume=int(c.get("volume", 0))
                )
                self.update(candle)

            logger.info(
                f"VWAP recalculated from {len(candles)} candles: "
                f"{self.current_vwap:.2f}"
            )
            return self.current_vwap

        except Exception as e:
            logger.error(f"VWAP fetch error: {e}")
            return self.current_vwap

    def get_vwap(self) -> float:
        return self.current_vwap

    def is_above_vwap(self, price: float) -> bool:
        if self.current_vwap == 0:
            return False
        return price > self.current_vwap

    def is_below_vwap(self, price: float) -> bool:
        if self.current_vwap == 0:
            return False
        return price < self.current_vwap

    def get_vwap_distance_pct(self, price: float) -> float:
        """Returns % distance from VWAP"""
        if self.current_vwap == 0:
            return 0
        return ((price - self.current_vwap) / self.current_vwap) * 100