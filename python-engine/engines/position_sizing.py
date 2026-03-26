import math
from models.session_data import TradeSignal, Direction, IAEScore, MarketState
from config import config
from utils.logger import setup_logger

logger = setup_logger("PositionSizing")

class PositionSizer:
    """
    Calculates lot size and position parameters
    Formula: lots = floor(risk_budget / (entry_premium × SL_PCT × LOT_SIZE))
    """

    def calculate(
            self,
            direction: Direction,
            iae: IAEScore,
            chain,
            market_state: MarketState,
            dte: int,
            current_capital: float
    ) -> TradeSignal:

        from models.session_data import TradeSignal, SystemMode

        signal = TradeSignal()
        signal.direction = direction
        signal.market_state = market_state
        signal.iae_score = iae.total_score
        signal.iae_breakdown = iae
        signal.dte = dte

        # Get size multiplier from IAE
        size_multiplier = iae.get_size_multiplier()

        # Apply DTE adjustments
        size_multiplier = self._apply_dte_adjustment(
            size_multiplier, dte, iae.total_score
        )

        # Apply VIX adjustment (if VIX > 22)
        # VIX check would come from chain data

        signal.size_multiplier = size_multiplier

        # Strike selection
        atm = chain.atm_strike
        strike_step = 50  # NIFTY strike step

        if direction == Direction.BULL:
            signal.option_type = "CE"
            signal.strike = atm  # ATM or 1-OTM
            signal.entry_premium = chain.atm_ce_ltp
        else:
            signal.option_type = "PE"
            signal.strike = atm
            signal.entry_premium = chain.atm_pe_ltp

        signal.entry_index_price = chain.nifty_ltp

        # Calculate lots
        risk_budget = current_capital * config.RISK_PCT * size_multiplier
        sl_loss_per_lot = (
                signal.entry_premium * config.SL_PCT * config.LOT_SIZE
        )

        if sl_loss_per_lot == 0:
            signal.is_valid = False
            signal.rejection_reason = "Entry premium is 0"
            return signal

        lots_by_risk = math.floor(risk_budget / sl_loss_per_lot)

        # Premium cap check (max 15% of capital)
        max_premium_capital = current_capital * config.MAX_PREMIUM_DEPLOYED
        lots_by_premium = math.floor(
            max_premium_capital / (signal.entry_premium * config.LOT_SIZE)
        )

        # Take the minimum
        signal.lots = max(1, min(lots_by_risk, lots_by_premium))

        # T1/T2/T3 lot split (40/30/30)
        signal.t1_lots = max(1, math.floor(signal.lots * 0.40))
        signal.t2_lots = max(1, math.floor(signal.lots * 0.30))
        signal.t3_lots = signal.lots - signal.t1_lots - signal.t2_lots

        # Ensure minimum 3 lots for split to work
        if signal.lots < 3:
            signal.t1_lots = signal.lots
            signal.t2_lots = 0
            signal.t3_lots = 0

        # Calculate exit levels
        signal.t1_target = round(
            signal.entry_premium * (1 + config.T1_TARGET), 2
        )
        signal.t2_target = round(
            signal.entry_premium * (1 + config.T2_TARGET), 2
        )
        signal.sl_premium = round(
            signal.entry_premium * (1 - config.SL_PCT), 2
        )

        # Adverse index SL
        if direction == Direction.BULL:
            signal.adverse_index_sl = round(
                signal.entry_index_price * (1 - config.ADVERSE_PCT), 2
            )
        else:
            signal.adverse_index_sl = round(
                signal.entry_index_price * (1 + config.ADVERSE_PCT), 2
            )

        # Deployed capital
        signal.total_premium_deployed = (
                signal.entry_premium * signal.lots * config.LOT_SIZE
        )
        signal.risk_amount = (
                signal.entry_premium * config.SL_PCT *
                signal.lots * config.LOT_SIZE
        )

        signal.is_valid = True

        logger.info(f"""
POSITION SIZING RESULT:
  Direction:     {signal.direction.value} {signal.option_type}
  Strike:        {signal.strike}
  Entry Premium: ₹{signal.entry_premium}
  IAE Score:     {iae.total_score} | Multiplier: {size_multiplier}x
  Lots:          {signal.lots} (T1:{signal.t1_lots} T2:{signal.t2_lots} T3:{signal.t3_lots})
  Risk Budget:   ₹{risk_budget:.0f}
  Risk Amount:   ₹{signal.risk_amount:.0f}
  Deployed:      ₹{signal.total_premium_deployed:.0f}
  T1 Target:     ₹{signal.t1_target} (+40%)
  T2 Target:     ₹{signal.t2_target} (+80%)
  SL Premium:    ₹{signal.sl_premium} (-32%)
  Index SL:      {signal.adverse_index_sl}
        """)

        return signal

    def _apply_dte_adjustment(
            self, base_multiplier: float, dte: int, iae_score: int
    ) -> float:
        """Apply DTE-specific size adjustments"""
        if dte == 1:
            # Pre-expiry day — require IAE 6+ and reduce size
            if iae_score < 6:
                return 0.0  # Block trade
            return min(base_multiplier, 0.5)

        elif dte == 0:
            # Expiry day — max 0.5x
            return min(base_multiplier, 0.5)

        elif dte in [2, 3]:
            # Near expiry — slight reduction
            return base_multiplier

        return base_multiplier