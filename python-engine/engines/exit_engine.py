from models.session_data import ActivePosition, TradeSignal, Direction
from config import config
from utils.logger import setup_logger
from utils.time_utils import is_after, now_ist
from enum import Enum
from typing import Optional

logger = setup_logger("ExitEngine")

class ExitAction(Enum):
    HOLD = "HOLD"
    EXIT_T1 = "EXIT_T1"
    EXIT_T2 = "EXIT_T2"
    EXIT_T3_TRAIL = "EXIT_T3_TRAIL"
    EXIT_ALL_SL = "EXIT_ALL_SL"
    EXIT_ALL_FORCE = "EXIT_ALL_FORCE"
    EXIT_ALL_ADVERSE = "EXIT_ALL_ADVERSE"
    TIGHTEN_TRAIL = "TIGHTEN_TRAIL"

class ExitEngine:
    """
    Manages the 40/30/30 Trail Exit System
    T1: +40% → Sell 40% hard
    T2: +80% → Sell 30% hard
    T3: Trail at 20% from peak until 15:15
    """

    def evaluate(
            self,
            position: ActivePosition,
            current_premium: float,
            current_index: float,
            is_expiry_day: bool = False,
            is_choppy_month: bool = False,
            is_trend_month: bool = False
    ) -> list:
        """
        Returns list of ExitAction to take
        """
        actions = []
        signal = position.signal

        # Update current values
        position.current_premium = current_premium
        position.current_index = current_index

        # Priority 1: Force exit at 15:15
        if is_after(config.FORCE_EXIT_TIME):
            logger.info(f"⏰ FORCE EXIT at {config.FORCE_EXIT_TIME}")
            actions.append(ExitAction.EXIT_ALL_FORCE)
            return actions

        # Priority 2: Check Standard SL (32% drop from entry)
        sl_action = self._check_sl(position, current_premium)
        if sl_action:
            actions.append(sl_action)
            return actions

        # Priority 3: Check Adverse Index Move (0.5%)
        adverse_action = self._check_adverse_index(
            position, current_index
        )
        if adverse_action:
            actions.append(adverse_action)
            return actions

        # Get trail percentage based on market conditions
        trail_pct = self._get_trail_pct(
            position.signal.dte, is_trend_month, is_choppy_month
        )

        # Priority 4: T1 exit
        if not position.t1_exited:
            t1_action = self._check_t1(
                position, current_premium, is_choppy_month
            )
            if t1_action:
                actions.append(t1_action)

        # Priority 5: T2 exit (only after T1)
        elif not position.t2_exited and position.t1_exited:
            t2_action = self._check_t2(
                position, current_premium, is_choppy_month
            )
            if t2_action:
                actions.append(t2_action)

        # Priority 6: T3 Trail management
        elif position.t2_exited and not position.t3_exited:
            trail_action = self._manage_t3_trail(
                position, current_premium, trail_pct
            )
            if trail_action:
                actions.append(trail_action)

        return actions

    def _check_sl(
            self, position: ActivePosition, current_premium: float
    ) -> Optional[ExitAction]:
        """Hard SL: 32% drop from entry premium"""
        entry = position.signal.entry_premium
        sl_level = entry * (1 - config.SL_PCT)

        if current_premium <= sl_level:
            logger.warning(
                f"🔴 SL HIT! Entry: {entry} | "
                f"SL Level: {sl_level:.2f} | "
                f"Current: {current_premium}"
            )
            return ExitAction.EXIT_ALL_SL
        return None

    def _check_adverse_index(
            self, position: ActivePosition, current_index: float
    ) -> Optional[ExitAction]:
        """Adverse index move: 0.5% from ENTRY price (not open)"""
        entry_index = position.signal.entry_index_price
        direction = position.signal.direction

        if direction == Direction.BULL:
            # For BULL: adverse = index falls 0.5% from entry
            adverse_level = entry_index * (1 - config.ADVERSE_PCT)
            if current_index <= adverse_level:
                logger.warning(
                    f"🔴 ADVERSE MOVE (BULL)! "
                    f"Entry Index: {entry_index} | "
                    f"Adverse Level: {adverse_level:.0f} | "
                    f"Current: {current_index}"
                )
                return ExitAction.EXIT_ALL_ADVERSE

        else:  # BEAR
            # For BEAR: adverse = index rises 0.5% from entry
            adverse_level = entry_index * (1 + config.ADVERSE_PCT)
            if current_index >= adverse_level:
                logger.warning(
                    f"🔴 ADVERSE MOVE (BEAR)! "
                    f"Entry Index: {entry_index} | "
                    f"Adverse Level: {adverse_level:.0f} | "
                    f"Current: {current_index}"
                )
                return ExitAction.EXIT_ALL_ADVERSE

        return None

    def _check_t1(
            self,
            position: ActivePosition,
            current_premium: float,
            is_choppy: bool
    ) -> Optional[ExitAction]:
        """T1: Exit 40% at +40% gain (or +30% in choppy month)"""
        entry = position.signal.entry_premium

        # Choppy month adjustment
        t1_multiplier = 1 + (
            0.30 if is_choppy else config.T1_TARGET
        )
        t1_level = entry * t1_multiplier

        if current_premium >= t1_level:
            pnl = (current_premium - entry) * position.signal.t1_lots * config.LOT_SIZE
            logger.info(
                f"✅ T1 HIT! Premium: {current_premium} | "
                f"Target: {t1_level:.2f} | "
                f"P&L: ₹{pnl:.0f}"
            )
            position.t1_exited = True
            position.t1_pnl = pnl
            return ExitAction.EXIT_T1

        return None

    def _check_t2(
            self,
            position: ActivePosition,
            current_premium: float,
            is_choppy: bool
    ) -> Optional[ExitAction]:
        """T2: Exit 30% at +80% gain"""
        entry = position.signal.entry_premium
        t2_level = entry * (1 + config.T2_TARGET)

        if current_premium >= t2_level:
            pnl = (current_premium - entry) * position.signal.t2_lots * config.LOT_SIZE
            logger.info(
                f"✅ T2 HIT! Premium: {current_premium} | "
                f"Target: {t2_level:.2f} | "
                f"P&L: ₹{pnl:.0f}"
            )
            position.t2_exited = True
            position.t2_pnl = pnl

            # Initialize T3 trail
            position.t3_peak_premium = current_premium
            trail_pct = self._get_trail_pct(position.signal.dte)
            position.t3_trail_sl = current_premium * (1 - trail_pct)

            logger.info(
                f"T3 TRAIL INITIALIZED | "
                f"Peak: {current_premium} | "
                f"Trail SL: {position.t3_trail_sl:.2f}"
            )

            return ExitAction.EXIT_T2

        return None

    def _manage_t3_trail(
            self,
            position: ActivePosition,
            current_premium: float,
            trail_pct: float
    ) -> Optional[ExitAction]:
        """
        T3 Trail: 20% trailing SL from peak
        Updates peak if new high
        Exits if drops 20% from peak
        NEVER manually closed early
        """
        # Update peak if new high
        if current_premium > position.t3_peak_premium:
            position.t3_peak_premium = current_premium
            position.t3_trail_sl = current_premium * (1 - trail_pct)
            logger.debug(
                f"T3 New Peak: {current_premium} | "
                f"Trail SL updated: {position.t3_trail_sl:.2f}"
            )

        # Check if trail SL hit
        if current_premium <= position.t3_trail_sl:
            pnl = (current_premium - position.signal.entry_premium) * \
                  position.signal.t3_lots * config.LOT_SIZE
            logger.info(
                f"✅ T3 TRAIL HIT! "
                f"Peak: {position.t3_peak_premium} | "
                f"Trail SL: {position.t3_trail_sl:.2f} | "
                f"Exit: {current_premium} | "
                f"P&L: ₹{pnl:.0f}"
            )
            position.t3_exited = True
            position.t3_pnl = pnl
            return ExitAction.EXIT_T3_TRAIL

        return None

    def _get_trail_pct(
            self,
            dte: int,
            is_trend_month: bool = False,
            is_choppy_month: bool = False
    ) -> float:
        """Get trailing SL percentage based on conditions"""
        base_trail = config.T3_TRAIL_PCT  # 0.20 (20%)

        # Trend month = tighter trail (capture more profit)
        if is_trend_month:
            return 0.15

        # DTE adjustments
        if dte in [1, 2]:
            return 0.15  # Tighter near expiry

        return base_trail

    def tighten_trail(self, position: ActivePosition) -> None:
        """Emergency trail tighten on structural flip"""
        if position.t2_exited and not position.t3_exited:
            old_sl = position.t3_trail_sl
            position.t3_trail_sl = position.t3_peak_premium * 0.90  # 10% trail
            logger.warning(
                f"TRAIL TIGHTENED (Structural Flip) | "
                f"Old SL: {old_sl:.2f} | New SL: {position.t3_trail_sl:.2f}"
            )