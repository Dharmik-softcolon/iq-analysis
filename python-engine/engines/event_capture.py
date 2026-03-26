from models.session_data import OptionChainData, TradeSignal, Direction
from config import config
from utils.logger import setup_logger
from utils.time_utils import is_between, now_ist
import math

logger = setup_logger("EventCapture")

EVENT_CALENDAR = {
    "2026-02-01": "Union Budget",
    "2026-02-06": "RBI Policy",
    "2026-04-03": "RBI Policy",
    "2026-06-05": "RBI Policy",
    "2026-08-07": "RBI Policy",
    "2026-10-02": "RBI Policy",
    "2026-12-04": "RBI Policy",
}

class EventCaptureEngine:
    """
    Event Capture Engine
    Strategy 1: Pre-event Straddle (09:20-09:25)
    Strategy 2: Post-event Momentum (after direction confirmed)
    """

    def is_event_day(self, chain: OptionChainData) -> dict:
        today = now_ist().strftime("%Y-%m-%d")
        is_calendar_event = today in EVENT_CALENDAR
        is_ivp_trigger = chain.ivp >= config.EVENT_IVP_TRIGGER

        result = {
            "is_event": is_calendar_event or is_ivp_trigger,
            "event_name": EVENT_CALENDAR.get(today, "High IV Event"),
            "ivp": chain.ivp,
            "mode": "NORMAL",
            "calendar_event": is_calendar_event,
            "ivp_triggered": is_ivp_trigger
        }

        if chain.ivp >= config.HIGH_EVENT_IVP:
            result["mode"] = "HIGH_EVENT"
        elif is_ivp_trigger or is_calendar_event:
            result["mode"] = "EVENT"

        if result["is_event"]:
            logger.info(
                f"EVENT MODE ACTIVATED | "
                f"{result['event_name']} | "
                f"IVP: {chain.ivp}"
            )

        return result

    def calculate_straddle_signal(
            self,
            chain: OptionChainData,
            current_capital: float,
            dte: int
    ) -> dict:
        """
        Strategy 1: ATM Straddle Entry (09:20-09:25 only)
        Never enter after 09:30
        Never on expiry day (DTE=0)
        """
        # Block on expiry day
        if dte == 0:
            return {
                "valid": False,
                "reason": "DTE=0 — No straddle on expiry day"
            }

        # Check entry window
        if not is_between("09:20", "09:25"):
            return {
                "valid": False,
                "reason": "Outside straddle window (09:20-09:25)"
            }

        atm_strike = chain.atm_strike
        ce_premium = chain.atm_ce_ltp
        pe_premium = chain.atm_pe_ltp

        if ce_premium == 0 or pe_premium == 0:
            return {
                "valid": False,
                "reason": "ATM premiums not available"
            }

        total_premium_per_pair = ce_premium + pe_premium

        # Size: 3% of capital per leg pair
        straddle_budget = current_capital * config.STRADDLE_SIZE_PCT
        max_budget = current_capital * config.STRADDLE_MAX_DEPLOYED

        lots_by_budget = math.floor(
            straddle_budget / (total_premium_per_pair * config.LOT_SIZE)
        )
        lots_by_max = math.floor(
            max_budget / (total_premium_per_pair * config.LOT_SIZE)
        )

        lots = max(1, min(lots_by_budget, lots_by_max))
        deployed = total_premium_per_pair * lots * config.LOT_SIZE

        # Exit levels
        ce_lock_trigger = ce_premium * (1 + config.STRADDLE_LOCK_TRIGGER)
        pe_lock_trigger = pe_premium * (1 + config.STRADDLE_LOCK_TRIGGER)
        ce_sl = ce_premium * (1 - config.STRADDLE_LOSING_SL)
        pe_sl = pe_premium * (1 - config.STRADDLE_LOSING_SL)

        logger.info(f"""
STRADDLE SIGNAL GENERATED:
  Strike:        {atm_strike} ATM
  CE Premium:    ₹{ce_premium} | Lock at: ₹{ce_lock_trigger:.2f}
  PE Premium:    ₹{pe_premium} | Lock at: ₹{pe_lock_trigger:.2f}
  Total/Pair:    ₹{total_premium_per_pair}
  Lots:          {lots}
  Deployed:      ₹{deployed:.0f}
  CE SL:         ₹{ce_sl:.2f}
  PE SL:         ₹{pe_sl:.2f}
        """)

        return {
            "valid": True,
            "type": "STRADDLE",
            "strike": atm_strike,
            "lots": lots,
            "ce_premium": ce_premium,
            "pe_premium": pe_premium,
            "total_premium": total_premium_per_pair,
            "deployed": deployed,
            "ce_lock_trigger": round(ce_lock_trigger, 2),
            "pe_lock_trigger": round(pe_lock_trigger, 2),
            "ce_sl": round(ce_sl, 2),
            "pe_sl": round(pe_sl, 2),
            "trail_pct": config.STRADDLE_TRAIL
        }

    def calculate_momentum_signal(
            self,
            chain: OptionChainData,
            iae_score: int,
            direction: Direction,
            current_capital: float,
            flip_confirmed_minutes: int
    ) -> dict:
        """
        Strategy 2: Post-event directional momentum trade
        Triggered after structural flip sustained 15+ minutes
        IAE minimum drops to 3 in event mode
        """
        # Must have direction confirmed
        if direction == Direction.NO_TRADE:
            return {
                "valid": False,
                "reason": "No confirmed direction for momentum trade"
            }

        # Check flip confirmation window
        if flip_confirmed_minutes < config.FLIP_CONFIRM_MINUTES:
            return {
                "valid": False,
                "reason": f"Flip not confirmed yet "
                          f"({flip_confirmed_minutes}/{config.FLIP_CONFIRM_MINUTES} min)"
            }

        # Event mode IAE minimum is 3 (not 4)
        if iae_score < config.MOMENTUM_IAE_MIN:
            return {
                "valid": False,
                "reason": f"IAE {iae_score} < {config.MOMENTUM_IAE_MIN} "
                          f"(Event mode minimum)"
            }

        # Size is always 0.75x in event mode
        size_multiplier = config.MOMENTUM_SIZE

        if direction == Direction.BULL:
            premium = chain.atm_ce_ltp
            option_type = "CE"
        else:
            premium = chain.atm_pe_ltp
            option_type = "PE"

        risk_budget = current_capital * config.RISK_PCT * size_multiplier
        sl_per_lot = premium * config.SL_PCT * config.LOT_SIZE
        lots = max(1, math.floor(risk_budget / sl_per_lot))

        logger.info(
            f"MOMENTUM SIGNAL | "
            f"{direction.value} {option_type} | "
            f"IAE: {iae_score} | Lots: {lots} | "
            f"Trail: {config.MOMENTUM_TRAIL * 100}%"
        )

        return {
            "valid": True,
            "type": "MOMENTUM",
            "direction": direction.value,
            "option_type": option_type,
            "strike": chain.atm_strike,
            "premium": premium,
            "lots": lots,
            "size_multiplier": size_multiplier,
            "trail_pct": config.MOMENTUM_TRAIL,
            "sl": round(premium * (1 - config.SL_PCT), 2)
        }

    def evaluate_straddle_exit(
            self,
            straddle_position: dict,
            ce_current: float,
            pe_current: float
    ) -> dict:
        """
        Evaluate straddle exit conditions every minute
        Returns action to take
        """
        ce_entry = straddle_position["ce_premium"]
        pe_entry = straddle_position["pe_premium"]
        ce_locked = straddle_position.get("ce_locked", False)
        pe_locked = straddle_position.get("pe_locked", False)

        actions = []

        # Check winning leg lock trigger (+100%)
        if not ce_locked and ce_current >= straddle_position["ce_lock_trigger"]:
            actions.append({
                "action": "LOCK_CE",
                "reason": f"CE gained 100%+ ({ce_entry} → {ce_current})",
                "pnl": (ce_current - ce_entry) * straddle_position["lots"] * config.LOT_SIZE
            })

        if not pe_locked and pe_current >= straddle_position["pe_lock_trigger"]:
            actions.append({
                "action": "LOCK_PE",
                "reason": f"PE gained 100%+ ({pe_entry} → {pe_current})",
                "pnl": (pe_current - pe_entry) * straddle_position["lots"] * config.LOT_SIZE
            })

        # Check losing leg SL (50%)
        if not ce_locked and ce_current <= straddle_position["ce_sl"]:
            if not pe_locked:
                actions.append({
                    "action": "EXIT_BOTH",
                    "reason": "CE down 50% before PE locked"
                })

        if not pe_locked and pe_current <= straddle_position["pe_sl"]:
            if not ce_locked:
                actions.append({
                    "action": "EXIT_BOTH",
                    "reason": "PE down 50% before CE locked"
                })

        return {"actions": actions}