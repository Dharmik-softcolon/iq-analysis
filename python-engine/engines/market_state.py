from models.session_data import MarketState, OptionChainData
from config import config
from utils.logger import setup_logger

logger = setup_logger("MarketState")

class MarketStateClassifier:
    """
    Classifies market into DISCOVERY / TRANSITION / BALANCE
    at IB close (09:30-09:45 IST)
    """

    def classify(self, chain: OptionChainData) -> MarketState:
        """
        State Triggers:
        DISCOVERY:  Day range > 1.2% AND |chg%| > 0.7% at IB close
                    OR gap > 0.5% from prev close
        TRANSITION: Day range 0.5-1.2% OR |chg%| 0.2-0.7%
        BALANCE:    Day range < 0.5% AND |chg%| < 0.2%
                    PCR near 1.0 (0.90-1.10)
        """

        if chain.nifty_open == 0 or chain.nifty_prev_close == 0:
            logger.warning("Missing price data for market state")
            return MarketState.UNKNOWN

        # Calculate metrics
        day_range_pct = self._day_range_pct(chain)
        change_pct = abs(self._change_pct(chain))
        gap_pct = abs(self._gap_pct(chain))

        logger.info(
            f"Market State Inputs → "
            f"Range: {day_range_pct:.3f}% | "
            f"Change: {change_pct:.3f}% | "
            f"Gap: {gap_pct:.3f}% | "
            f"PCR: {chain.pcr_oi:.2f}"
        )

        # DISCOVERY check
        if (day_range_pct > 1.2 and change_pct > 0.7) or gap_pct > 0.5:
            logger.info(f"State: DISCOVERY")
            return MarketState.DISCOVERY

        # BALANCE check
        if (day_range_pct < 0.5 and change_pct < 0.2 and
                0.90 <= chain.pcr_oi <= 1.10):
            logger.info(f"State: BALANCE")
            return MarketState.BALANCE

        # TRANSITION (default between)
        if (0.5 <= day_range_pct <= 1.2) or (0.2 <= change_pct <= 0.7):
            logger.info(f"State: TRANSITION")
            return MarketState.TRANSITION

        # Default
        logger.info(f"State: TRANSITION (default)")
        return MarketState.TRANSITION

    def _day_range_pct(self, chain: OptionChainData) -> float:
        if chain.nifty_open == 0:
            return 0
        day_range = chain.nifty_high - chain.nifty_low
        return (day_range / chain.nifty_open) * 100

    def _change_pct(self, chain: OptionChainData) -> float:
        if chain.nifty_open == 0:
            return 0
        return ((chain.nifty_ltp - chain.nifty_open) / chain.nifty_open) * 100

    def _gap_pct(self, chain: OptionChainData) -> float:
        if chain.nifty_prev_close == 0:
            return 0
        return ((chain.nifty_open - chain.nifty_prev_close) /
                chain.nifty_prev_close) * 100

    def get_gap_rule(self, chain: OptionChainData) -> dict:
        """Returns gap trading rule for current session"""
        gap_pct = abs(self._gap_pct(chain))

        if gap_pct < 0.3:
            return {"rule": "NORMAL", "can_trade": True}
        elif gap_pct <= 0.8:
            return {"rule": "MODERATE_GAP", "can_trade": True,
                    "requires_buildup_confirmation": True}
        elif gap_pct <= 1.5:
            return {"rule": "LARGE_GAP", "can_trade": False,
                    "wait_minutes": 30}
        else:
            return {"rule": "EXTREME_GAP", "can_trade": False,
                    "iae_override": 7}  # Only trade if IAE reaches 7