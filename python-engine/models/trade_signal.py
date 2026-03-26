"""
WhaleHQ v6.0 — Trade Signal Models
Complete data models for all trade-related objects
Used across all engines for type safety and consistency
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict
from enum import Enum
from datetime import datetime
import uuid


# ─────────────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────────────

class MarketState(Enum):
    DISCOVERY = "DISCOVERY"
    TRANSITION = "TRANSITION"
    BALANCE = "BALANCE"
    UNKNOWN = "UNKNOWN"


class Direction(Enum):
    BULL = "BULL"
    BEAR = "BEAR"
    NO_TRADE = "NO_TRADE"


class BuildupType(Enum):
    LB = "Long Buildup"       # Bullish
    SC = "Short Cover"         # Bullish
    SB = "Short Buildup"       # Bearish
    LU = "Long Unwind"         # Bearish
    MIXED = "Mixed"            # No trade
    NONE = "None"              # No signal


class SystemMode(Enum):
    NORMAL = "NORMAL"
    EVENT = "EVENT"
    STANDBY = "STANDBY"
    SHUTDOWN = "SHUTDOWN"


class TradeStatus(Enum):
    ACTIVE = "ACTIVE"
    PARTIAL = "PARTIAL"
    CLOSED = "CLOSED"
    SL_HIT = "SL_HIT"
    CANCELLED = "CANCELLED"


class ExitReason(Enum):
    T1_TARGET = "T1_TARGET"
    T2_TARGET = "T2_TARGET"
    T3_TRAIL = "T3_TRAIL"
    SL_PREMIUM = "SL_PREMIUM"
    SL_ADVERSE_INDEX = "SL_ADVERSE_INDEX"
    FORCE_EXIT_1515 = "FORCE_EXIT_1515"
    THETA_KILL = "THETA_KILL"
    MANUAL_EXIT = "MANUAL_EXIT"
    EMERGENCY_EXIT = "EMERGENCY_EXIT"
    DAILY_LOSS_LIMIT = "DAILY_LOSS_LIMIT"
    STRUCTURAL_FLIP = "STRUCTURAL_FLIP"


class EntryWindow(Enum):
    PRE_MARKET = "PRE_MARKET"        # 09:20-09:25 (straddle only)
    IB = "IB"                         # 09:30-09:45
    POST_IB = "POST_IB"               # 09:45-10:30
    LATE = "LATE"                     # 10:30-12:00
    EVENT_STRADDLE = "EVENT_STRADDLE"
    EVENT_MOMENTUM = "EVENT_MOMENTUM"


class SignalType(Enum):
    DIRECTIONAL = "DIRECTIONAL"       # Normal CE or PE
    STRADDLE = "STRADDLE"             # CE + PE both
    MOMENTUM = "MOMENTUM"             # Event mode momentum


# ─────────────────────────────────────────────────────
# OPTION CHAIN DATA
# ─────────────────────────────────────────────────────

@dataclass
class OptionChainData:
    """
    Raw option chain data fetched every 60 seconds
    from Zerodha (price) + NSE/Opstra (OI)
    """
    timestamp: str = ""

    # ── Premium Changes (in points) ───────────────
    total_call_prem_chg: float = 0.0
    total_put_prem_chg: float = 0.0

    # ── OI Data (in Crores) ───────────────────────
    total_bullish_oi: float = 0.0
    total_bearish_oi: float = 0.0

    # ── OI Changes (in Crores) ────────────────────
    sb_oi_chg: float = 0.0       # Short Buildup OI Change
    lb_oi_chg: float = 0.0       # Long Buildup OI Change
    sc_oi_chg: float = 0.0       # Short Cover OI Change
    lu_oi_chg: float = 0.0       # Long Unwind OI Change

    # ── PCR ───────────────────────────────────────
    pcr_oi: float = 1.0           # Put-Call Ratio by OI
    itm_pcr: float = 0.0          # ITM Put-Call Ratio

    # ── Volatility ────────────────────────────────
    iv_avg: float = 0.0           # Average IV (ATM ± 2 strikes)
    ivp: float = 0.0              # IV Percentile (for event mode)

    # ── Buildup Classification ────────────────────
    dominant_buildup: BuildupType = BuildupType.NONE

    # ── NIFTY Price Data ──────────────────────────
    nifty_ltp: float = 0.0
    nifty_vwap: float = 0.0
    nifty_open: float = 0.0
    nifty_high: float = 0.0
    nifty_low: float = 0.0
    nifty_prev_close: float = 0.0

    # ── ATM Strike & Premiums ─────────────────────
    atm_strike: int = 0
    atm_ce_ltp: float = 0.0
    atm_pe_ltp: float = 0.0

    # ── Expiry Info ───────────────────────────────
    dte: int = 5
    expiry_date: str = ""

    # ── Data Source ───────────────────────────────
    data_source_price: str = "ZERODHA"
    data_source_oi: str = "NSE"

    def is_valid(self) -> bool:
        """Check if data is usable for IAE scoring"""
        return (
                self.nifty_ltp > 0
                and self.atm_strike > 0
                and self.expiry_date != ""
        )

    def get_gap_pct(self) -> float:
        """Gap % from previous close"""
        if self.nifty_prev_close == 0:
            return 0.0
        return (
                (self.nifty_open - self.nifty_prev_close)
                / self.nifty_prev_close
        ) * 100

    def get_day_range_pct(self) -> float:
        """Day range as % of open"""
        if self.nifty_open == 0:
            return 0.0
        return (
                (self.nifty_high - self.nifty_low)
                / self.nifty_open
        ) * 100

    def get_change_pct(self) -> float:
        """Intraday change % from open"""
        if self.nifty_open == 0:
            return 0.0
        return (
                (self.nifty_ltp - self.nifty_open)
                / self.nifty_open
        ) * 100


# ─────────────────────────────────────────────────────
# IAE SCORE
# ─────────────────────────────────────────────────────

@dataclass
class IAEEngineResult:
    """Result from a single IAE engine"""
    engine_name: str = ""
    score: int = 0
    max_score: int = 1
    triggered: bool = False
    direction: Direction = Direction.NO_TRADE
    trigger_value: float = 0.0
    trigger_threshold: float = 0.0
    notes: str = ""


@dataclass
class IAEScore:
    """
    Complete IAE Scoring Result
    Scores 0-8 from 7 independent engines
    Minimum 4 required to trade
    """

    # ── Individual Engine Scores ──────────────────
    is_ib_score: int = 0           # Max +2
    pure_oi_score: int = 0         # Max +2
    oi_delta_score: int = 0        # Max +1
    volx_score: int = 0            # Max +1
    gamma_score: int = 0           # Max +1
    mp_acceptance_score: int = 0   # Max +1
    tre_score: int = 0             # Max +1

    # ── Triggered Flags ───────────────────────────
    is_ib_triggered: bool = False
    pure_oi_triggered: bool = False
    oi_delta_triggered: bool = False
    volx_triggered: bool = False
    gamma_triggered: bool = False
    mp_triggered: bool = False
    tre_triggered: bool = False

    # ── Direction from Each Engine ────────────────
    is_ib_direction: Direction = Direction.NO_TRADE
    pure_oi_direction: Direction = Direction.NO_TRADE
    oi_delta_direction: Direction = Direction.NO_TRADE

    # ── Detailed Engine Results ───────────────────
    engine_results: List[IAEEngineResult] = field(
        default_factory=list
    )

    # ── Computed Fields ───────────────────────────
    scored_at: str = ""
    market_state_at_scoring: MarketState = MarketState.UNKNOWN

    @property
    def total_score(self) -> int:
        return (
                self.is_ib_score
                + self.pure_oi_score
                + self.oi_delta_score
                + self.volx_score
                + self.gamma_score
                + self.mp_acceptance_score
                + self.tre_score
        )

    def can_trade(self) -> bool:
        return self.total_score >= 4

    def get_size_multiplier(self) -> float:
        score = self.total_score
        if score >= 6:
            return 1.0
        elif score == 5:
            return 0.75
        elif score == 4:
            return 0.50
        return 0.0

    def get_expected_win_rate(self) -> str:
        score = self.total_score
        if score >= 7:
            return "90%+"
        elif score == 6:
            return "80-85%"
        elif score == 5:
            return "70-75%"
        elif score == 4:
            return "60-65%"
        return "N/A"

    def get_verdict(self) -> str:
        score = self.total_score
        if score >= 7:
            return "MAX CONVICTION — FULL SIZE"
        elif score == 6:
            return "HIGH CONVICTION — FULL SIZE"
        elif score == 5:
            return "GOOD SIGNAL — 3/4 SIZE"
        elif score == 4:
            return "MINIMUM THRESHOLD — HALF SIZE"
        elif score == 3:
            return "BELOW MINIMUM — NO TRADE"
        return "INSUFFICIENT SIGNAL — NO TRADE"

    def to_dict(self) -> dict:
        return {
            "totalScore": self.total_score,
            "isIb": self.is_ib_score,
            "pureOI": self.pure_oi_score,
            "oiDelta": self.oi_delta_score,
            "volX": self.volx_score,
            "gamma": self.gamma_score,
            "mp": self.mp_acceptance_score,
            "tre": self.tre_score,
            "canTrade": self.can_trade(),
            "sizeMultiplier": self.get_size_multiplier(),
            "verdict": self.get_verdict(),
            "expectedWinRate": self.get_expected_win_rate(),
        }


# ─────────────────────────────────────────────────────
# TRADE SIGNAL
# ─────────────────────────────────────────────────────

@dataclass
class TradeSignal:
    """
    Complete trade signal generated by IAE engine
    Contains all parameters needed for order execution
    """

    # ── Identity ──────────────────────────────────
    signal_id: str = field(
        default_factory=lambda: str(uuid.uuid4())
    )
    timestamp: str = field(
        default_factory=lambda: datetime.now().isoformat()
    )
    signal_type: SignalType = SignalType.DIRECTIONAL

    # ── Core Signal ───────────────────────────────
    direction: Direction = Direction.NO_TRADE
    market_state: MarketState = MarketState.UNKNOWN
    iae_score: int = 0
    iae_breakdown: Optional[IAEScore] = None

    # ── Instrument ────────────────────────────────
    symbol: str = "NIFTY"
    instrument: str = ""          # e.g. "NIFTY24JAN25000CE"
    strike: int = 0
    option_type: str = ""         # "CE" or "PE"
    expiry_date: str = ""

    # ── Entry ─────────────────────────────────────
    entry_premium: float = 0.0
    entry_index_price: float = 0.0
    entry_window: EntryWindow = EntryWindow.IB
    entry_time: str = ""

    # ── Position Size ─────────────────────────────
    lots: int = 0
    lot_size: int = 75
    size_multiplier: float = 1.0
    total_premium_deployed: float = 0.0
    risk_amount: float = 0.0

    # ── Tranche Split (40/30/30) ──────────────────
    t1_lots: int = 0
    t2_lots: int = 0
    t3_lots: int = 0

    # ── Exit Targets ──────────────────────────────
    t1_target: float = 0.0        # Entry × 1.40 (+40%)
    t2_target: float = 0.0        # Entry × 1.80 (+80%)
    sl_premium: float = 0.0       # Entry × 0.68 (-32%)
    adverse_index_sl: float = 0.0 # Index ± 0.5% from entry

    # ── Trail Config ──────────────────────────────
    t3_trail_pct: float = 0.20    # 20% trailing SL

    # ── Session Context ───────────────────────────
    system_mode: SystemMode = SystemMode.NORMAL
    dte: int = 5
    is_expiry_day: bool = False
    is_choppy_month: bool = False
    is_trend_month: bool = False

    # ── Validity ──────────────────────────────────
    is_valid: bool = False
    rejection_reason: str = ""

    def get_total_units(self) -> int:
        """Total quantity in units (lots × lot_size)"""
        return self.lots * self.lot_size

    def get_t1_units(self) -> int:
        return self.t1_lots * self.lot_size

    def get_t2_units(self) -> int:
        return self.t2_lots * self.lot_size

    def get_t3_units(self) -> int:
        return self.t3_lots * self.lot_size

    def get_max_profit_estimate(self) -> float:
        """Rough estimate if T3 runs 3x from entry"""
        t1_profit = (
                (self.t1_target - self.entry_premium)
                * self.t1_lots
                * self.lot_size
        )
        t2_profit = (
                (self.t2_target - self.entry_premium)
                * self.t2_lots
                * self.lot_size
        )
        # T3 estimate: 200% gain
        t3_estimate = (
                self.entry_premium * 2.0
                * self.t3_lots
                * self.lot_size
        )
        return t1_profit + t2_profit + t3_estimate

    def get_max_loss(self) -> float:
        """Maximum loss if SL hits on all lots"""
        return -1 * self.risk_amount

    def get_rr_estimate(self) -> float:
        """Risk-reward ratio estimate"""
        max_loss = abs(self.get_max_loss())
        if max_loss == 0:
            return 0.0
        return round(self.get_max_profit_estimate() / max_loss, 2)

    def to_dict(self) -> dict:
        """Convert to dict for sending to Node.js"""
        return {
            "signalId": self.signal_id,
            "timestamp": self.timestamp,
            "signalType": self.signal_type.value,
            "direction": self.direction.value,
            "marketState": self.market_state.value,
            "iaeScore": self.iae_score,
            "iaeBreakdown": (
                self.iae_breakdown.to_dict()
                if self.iae_breakdown else {}
            ),
            "symbol": self.symbol,
            "instrument": self.instrument,
            "strike": self.strike,
            "optionType": self.option_type,
            "expiry": self.expiry_date,
            "entryPremium": self.entry_premium,
            "entryIndexPrice": self.entry_index_price,
            "entryWindow": self.entry_window.value,
            "entryTime": self.entry_time,
            "lots": self.lots,
            "lotSize": self.lot_size,
            "sizeMultiplier": self.size_multiplier,
            "capitalDeployed": self.total_premium_deployed,
            "riskAmount": self.risk_amount,
            "t1Lots": self.t1_lots,
            "t2Lots": self.t2_lots,
            "t3Lots": self.t3_lots,
            "t1Target": self.t1_target,
            "t2Target": self.t2_target,
            "slPremium": self.sl_premium,
            "adverseIndexSL": self.adverse_index_sl,
            "t3TrailPct": self.t3_trail_pct,
            "systemMode": self.system_mode.value,
            "dte": self.dte,
            "isExpiryDay": self.is_expiry_day,
            "isChoppyMonth": self.is_choppy_month,
            "isTrendMonth": self.is_trend_month,
            "isValid": self.is_valid,
            "rejectionReason": self.rejection_reason,
            "maxProfitEstimate": self.get_max_profit_estimate(),
            "maxLoss": self.get_max_loss(),
            "rrEstimate": self.get_rr_estimate(),
        }


# ─────────────────────────────────────────────────────
# ACTIVE POSITION
# ─────────────────────────────────────────────────────

@dataclass
class ActivePosition:
    """
    Tracks a live active trade in memory
    Updated every 60 seconds during market hours
    """

    # ── Original Signal ───────────────────────────
    signal: TradeSignal = field(default_factory=TradeSignal)

    # ── Position Status ───────────────────────────
    status: TradeStatus = TradeStatus.ACTIVE
    opened_at: str = field(
        default_factory=lambda: datetime.now().isoformat()
    )

    # ── Tranche Exit Status ───────────────────────
    t1_exited: bool = False
    t1_exit_premium: float = 0.0
    t1_exit_time: str = ""
    t1_pnl: float = 0.0

    t2_exited: bool = False
    t2_exit_premium: float = 0.0
    t2_exit_time: str = ""
    t2_pnl: float = 0.0

    t3_exited: bool = False
    t3_exit_premium: float = 0.0
    t3_exit_time: str = ""
    t3_pnl: float = 0.0

    # ── T3 Trail Tracking ─────────────────────────
    t3_peak_premium: float = 0.0
    t3_trail_sl: float = 0.0
    t3_trail_activated: bool = False

    # ── Live Market Data ──────────────────────────
    current_premium: float = 0.0
    current_index: float = 0.0
    last_updated: str = ""

    # ── Structural Flip Tracking ──────────────────
    flip_detected_time: Optional[str] = None
    flip_direction: Direction = Direction.NO_TRADE
    flip_action_taken: bool = False

    # ── Exit Info ─────────────────────────────────
    exit_reason: ExitReason = ExitReason.T3_TRAIL
    closed_at: str = ""

    @property
    def total_pnl(self) -> float:
        return self.t1_pnl + self.t2_pnl + self.t3_pnl

    @property
    def unrealized_pnl(self) -> float:
        """Current unrealized P&L on remaining open lots"""
        if self.current_premium == 0:
            return 0.0
        remaining_lots = self._get_remaining_lots()
        return (
                (self.current_premium - self.signal.entry_premium)
                * remaining_lots
                * self.signal.lot_size
        )

    @property
    def total_pnl_including_open(self) -> float:
        return self.total_pnl + self.unrealized_pnl

    @property
    def current_gain_pct(self) -> float:
        """Current premium gain % from entry"""
        if self.signal.entry_premium == 0:
            return 0.0
        return (
                (self.current_premium - self.signal.entry_premium)
                / self.signal.entry_premium
        ) * 100

    @property
    def is_fully_closed(self) -> bool:
        """True when all tranches exited"""
        if self.signal.t3_lots == 0:
            return self.t1_exited and self.t2_exited
        return self.t1_exited and self.t2_exited and self.t3_exited

    def _get_remaining_lots(self) -> int:
        remaining = self.signal.lots
        if self.t1_exited:
            remaining -= self.signal.t1_lots
        if self.t2_exited:
            remaining -= self.signal.t2_lots
        if self.t3_exited:
            remaining -= self.signal.t3_lots
        return max(0, remaining)

    def get_next_target(self) -> Optional[float]:
        """Returns the next price target to hit"""
        if not self.t1_exited:
            return self.signal.t1_target
        elif not self.t2_exited:
            return self.signal.t2_target
        elif not self.t3_exited and self.t3_trail_sl > 0:
            return None  # Trail — no fixed target
        return None

    def update_t3_trail(self, current_premium: float) -> bool:
        """
        Update T3 trail SL with new premium
        Returns True if trail SL was hit
        """
        if not self.t2_exited or self.t3_exited:
            return False

        # Update peak
        if current_premium > self.t3_peak_premium:
            self.t3_peak_premium = current_premium
            trail_pct = self.signal.t3_trail_pct
            self.t3_trail_sl = current_premium * (1 - trail_pct)

        # Check if trail hit
        if (self.t3_trail_sl > 0
                and current_premium <= self.t3_trail_sl):
            return True

        return False

    def to_summary_dict(self) -> dict:
        """Summary for logging and UI"""
        return {
            "signalId": self.signal.signal_id,
            "direction": self.signal.direction.value,
            "optionType": self.signal.option_type,
            "strike": self.signal.strike,
            "entryPremium": self.signal.entry_premium,
            "currentPremium": self.current_premium,
            "currentGainPct": round(self.current_gain_pct, 2),
            "lots": self.signal.lots,
            "status": self.status.value,
            "t1Exited": self.t1_exited,
            "t2Exited": self.t2_exited,
            "t3Exited": self.t3_exited,
            "t3PeakPremium": self.t3_peak_premium,
            "t3TrailSL": self.t3_trail_sl,
            "realizedPnL": self.total_pnl,
            "unrealizedPnL": round(self.unrealized_pnl, 0),
            "totalPnL": round(self.total_pnl_including_open, 0),
            "iaeScore": self.signal.iae_score,
            "dte": self.signal.dte,
        }


# ─────────────────────────────────────────────────────
# STRADDLE POSITION
# ─────────────────────────────────────────────────────

@dataclass
class StraddlePosition:
    """
    Event mode straddle position tracking
    Tracks CE and PE legs separately
    """

    # ── Identity ──────────────────────────────────
    position_id: str = field(
        default_factory=lambda: str(uuid.uuid4())
    )
    timestamp: str = field(
        default_factory=lambda: datetime.now().isoformat()
    )

    # ── Instrument ────────────────────────────────
    symbol: str = "NIFTY"
    strike: int = 0
    expiry_date: str = ""
    lots: int = 0

    # ── CE Leg ────────────────────────────────────
    ce_entry_premium: float = 0.0
    ce_current_premium: float = 0.0
    ce_lock_trigger: float = 0.0    # Entry × 2 (+100%)
    ce_sl: float = 0.0              # Entry × 0.50 (-50%)
    ce_locked: bool = False
    ce_lock_premium: float = 0.0
    ce_lock_pnl: float = 0.0
    ce_exited: bool = False
    ce_exit_premium: float = 0.0
    ce_exit_pnl: float = 0.0
    ce_peak_premium: float = 0.0
    ce_trail_sl: float = 0.0

    # ── PE Leg ────────────────────────────────────
    pe_entry_premium: float = 0.0
    pe_current_premium: float = 0.0
    pe_lock_trigger: float = 0.0
    pe_sl: float = 0.0
    pe_locked: bool = False
    pe_lock_premium: float = 0.0
    pe_lock_pnl: float = 0.0
    pe_exited: bool = False
    pe_exit_premium: float = 0.0
    pe_exit_pnl: float = 0.0
    pe_peak_premium: float = 0.0
    pe_trail_sl: float = 0.0

    # ── Overall ───────────────────────────────────
    total_deployed: float = 0.0
    total_pnl: float = 0.0
    is_closed: bool = False
    close_reason: str = ""
    trail_pct: float = 0.20

    @property
    def net_pnl(self) -> float:
        return (
                self.ce_lock_pnl + self.ce_exit_pnl
                + self.pe_lock_pnl + self.pe_exit_pnl
        )

    def update_trails(self) -> dict:
        """
        Update trail SLs for locked legs
        Returns actions needed
        """
        actions = []

        # CE trail
        if self.ce_locked and not self.ce_exited:
            if self.ce_current_premium > self.ce_peak_premium:
                self.ce_peak_premium = self.ce_current_premium
                self.ce_trail_sl = (
                        self.ce_current_premium * (1 - self.trail_pct)
                )
            if (self.ce_trail_sl > 0
                    and self.ce_current_premium <= self.ce_trail_sl):
                actions.append("EXIT_CE_TRAIL")

        # PE trail
        if self.pe_locked and not self.pe_exited:
            if self.pe_current_premium > self.pe_peak_premium:
                self.pe_peak_premium = self.pe_current_premium
                self.pe_trail_sl = (
                        self.pe_current_premium * (1 - self.trail_pct)
                )
            if (self.pe_trail_sl > 0
                    and self.pe_current_premium <= self.pe_trail_sl):
                actions.append("EXIT_PE_TRAIL")

        return {"actions": actions}


# ─────────────────────────────────────────────────────
# TRADE LOG ENTRY
# ─────────────────────────────────────────────────────

@dataclass
class TradeLogEntry:
    """
    Complete record of a finished trade
    Saved to MongoDB via Node.js
    """

    # ── Identity ──────────────────────────────────
    signal_id: str = ""
    date: str = ""

    # ── Signal ────────────────────────────────────
    direction: str = ""
    option_type: str = ""
    strike: int = 0
    expiry: str = ""
    iae_score: int = 0
    market_state: str = ""
    entry_window: str = ""

    # ── Entry ─────────────────────────────────────
    entry_premium: float = 0.0
    entry_index: float = 0.0
    entry_time: str = ""
    total_lots: int = 0

    # ── Exits ─────────────────────────────────────
    t1_exit_premium: float = 0.0
    t1_exit_time: str = ""
    t1_pnl: float = 0.0

    t2_exit_premium: float = 0.0
    t2_exit_time: str = ""
    t2_pnl: float = 0.0

    t3_exit_premium: float = 0.0
    t3_exit_time: str = ""
    t3_pnl: float = 0.0
    t3_peak_premium: float = 0.0

    # ── Summary ───────────────────────────────────
    total_pnl: float = 0.0
    status: str = ""
    exit_reason: str = ""
    capital_deployed: float = 0.0
    risk_amount: float = 0.0
    actual_rr: float = 0.0         # Actual R:R achieved

    # ── IAE Breakdown ─────────────────────────────
    iae_breakdown: Dict = field(default_factory=dict)

    def calculate_actual_rr(self) -> float:
        """Calculate actual R:R achieved"""
        if self.risk_amount == 0:
            return 0.0
        if self.total_pnl > 0:
            return round(self.total_pnl / self.risk_amount, 2)
        return round(self.total_pnl / self.risk_amount, 2)


# ─────────────────────────────────────────────────────
# SESSION STATS
# ─────────────────────────────────────────────────────

@dataclass
class SessionStats:
    """
    End-of-day session statistics
    Used for Telegram daily summary and DB storage
    """
    date: str = ""
    market_state: str = ""
    iae_score_of_day: int = 0
    direction_of_day: str = ""
    system_mode: str = ""

    # ── Trade Counts ──────────────────────────────
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    no_trades: int = 0

    # ── P&L ───────────────────────────────────────
    gross_pnl: float = 0.0
    capital_start: float = 0.0
    capital_end: float = 0.0

    # ── Best / Worst ──────────────────────────────
    best_trade_pnl: float = 0.0
    worst_trade_pnl: float = 0.0

    # ── Ratios ────────────────────────────────────
    win_rate: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    rr_ratio: float = 0.0

    # ── Flags ─────────────────────────────────────
    daily_loss_limit_hit: bool = False
    consecutive_sl_hits: int = 0
    theta_kill_active: bool = False

    def calculate_metrics(
            self, trades: List[TradeLogEntry]
    ) -> None:
        """Calculate all metrics from trade list"""
        self.total_trades = len(trades)
        if self.total_trades == 0:
            return

        winning = [t for t in trades if t.total_pnl > 0]
        losing = [t for t in trades if t.total_pnl <= 0]

        self.wins = len(winning)
        self.losses = len(losing)
        self.win_rate = (
            (self.wins / self.total_trades) * 100
            if self.total_trades > 0 else 0
        )

        self.gross_pnl = sum(t.total_pnl for t in trades)
        self.capital_end = self.capital_start + self.gross_pnl

        if winning:
            self.avg_win = sum(
                t.total_pnl for t in winning
            ) / len(winning)
            self.best_trade_pnl = max(
                t.total_pnl for t in winning
            )

        if losing:
            self.avg_loss = sum(
                t.total_pnl for t in losing
            ) / len(losing)
            self.worst_trade_pnl = min(
                t.total_pnl for t in losing
            )

        if self.avg_loss != 0:
            self.rr_ratio = abs(self.avg_win / self.avg_loss)