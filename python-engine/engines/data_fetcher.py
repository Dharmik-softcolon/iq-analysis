import requests
import time
from datetime import datetime
from models.session_data import OptionChainData, BuildupType
from config import config
from utils.logger import setup_logger
from utils.time_utils import now_ist

logger = setup_logger("DataFetcher")

class DataFetcher:
    """
    Fetches live data from Node.js server
    which proxies Zerodha Kite API
    """

    def __init__(self):
        self.base_url = config.NODE_SERVER_URL
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Internal-Key": "whalehq-python-engine"
        })

    def fetch_chain_data(self) -> OptionChainData:
        """Fetch complete option chain data from Node server"""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/market/chain",
                timeout=5
            )
            resp.raise_for_status()
            data = resp.json()

            return self._parse_chain(data)

        except requests.exceptions.RequestException as e:
            logger.error(f"Chain fetch failed: {e}")
            return OptionChainData()

    def fetch_nifty_price(self) -> dict:
        """Fetch current NIFTY price + VWAP"""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/market/price",
                timeout=3
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Price fetch failed: {e}")
            return {}

    def fetch_atm_premiums(self, strike: int, expiry: str) -> dict:
        """Fetch ATM CE + PE LTP"""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/market/atm",
                params={"strike": strike, "expiry": expiry},
                timeout=3
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"ATM fetch failed: {e}")
            return {}

    def send_signal(self, signal_data: dict) -> dict:
        """Send trade signal to Node.js for execution"""
        try:
            resp = self.session.post(
                f"{self.base_url}/api/orders/signal",
                json=signal_data,
                timeout=10
            )
            resp.raise_for_status()
            logger.info(f"Signal sent successfully: {resp.json()}")
            return resp.json()
        except Exception as e:
            logger.error(f"Signal send failed: {e}")
            return {"success": False, "error": str(e)}

    def send_exit_signal(self, exit_data: dict) -> dict:
        """Send exit signal to Node.js"""
        try:
            resp = self.session.post(
                f"{self.base_url}/api/orders/exit",
                json=exit_data,
                timeout=10
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Exit signal failed: {e}")
            return {"success": False, "error": str(e)}

    def update_session_state(self, state_data: dict) -> None:
        """Push current session state to Node for UI"""
        try:
            self.session.post(
                f"{self.base_url}/api/system/state",
                json=state_data,
                timeout=3
            )
        except Exception as e:
            logger.error(f"State update failed: {e}")

    def _parse_chain(self, data: dict) -> OptionChainData:
        """Parse raw API response into OptionChainData"""
        chain = OptionChainData()

        try:
            chain.timestamp = data.get("timestamp", "")
            chain.total_call_prem_chg = float(
                data.get("totalCallPremChg", 0)
            )
            chain.total_put_prem_chg = float(
                data.get("totalPutPremChg", 0)
            )
            chain.total_bullish_oi = float(
                data.get("totalBullishOI", 0)
            )
            chain.total_bearish_oi = float(
                data.get("totalBearishOI", 0)
            )
            chain.sb_oi_chg = float(data.get("sbOIChg", 0))
            chain.lb_oi_chg = float(data.get("lbOIChg", 0))
            chain.sc_oi_chg = float(data.get("scOIChg", 0))
            chain.lu_oi_chg = float(data.get("luOIChg", 0))
            chain.pcr_oi = float(data.get("pcrOI", 1.0))
            chain.itm_pcr = float(data.get("itmPCR", 0))
            chain.iv_avg = float(data.get("ivAvg", 0))
            chain.ivp = float(data.get("ivp", 0))
            chain.nifty_ltp = float(data.get("niftyLTP", 0))
            chain.nifty_vwap = float(data.get("niftyVWAP", 0))
            chain.nifty_open = float(data.get("niftyOpen", 0))
            chain.nifty_high = float(data.get("niftyHigh", 0))
            chain.nifty_low = float(data.get("niftyLow", 0))
            chain.nifty_prev_close = float(
                data.get("niftyPrevClose", 0)
            )
            chain.atm_strike = int(data.get("atmStrike", 0))
            chain.atm_ce_ltp = float(data.get("atmCELTP", 0))
            chain.atm_pe_ltp = float(data.get("atmPELTP", 0))
            chain.dte = int(data.get("dte", 5))
            chain.expiry_date = data.get("expiryDate", "")

            # Parse buildup
            buildup_str = data.get("dominantBuildup", "NONE").upper()
            buildup_map = {
                "LB": BuildupType.LB,
                "SC": BuildupType.SC,
                "SB": BuildupType.SB,
                "LU": BuildupType.LU,
                "MIXED": BuildupType.MIXED,
                "NONE": BuildupType.NONE
            }
            chain.dominant_buildup = buildup_map.get(
                buildup_str, BuildupType.NONE
            )

        except Exception as e:
            logger.error(f"Chain parse error: {e}")

        return chain