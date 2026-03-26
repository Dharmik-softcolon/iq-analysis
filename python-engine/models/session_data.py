from dataclasses import dataclass, field
from typing import Optional, List
from enum import Enum

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
    LB = "Long Buildup"
    SC = "Short Cover"
    SB = "Short Buildup"
    LU = "Long Unwind"
    MIXED = "Mixed"
    NONE = "None"

class SystemMode(Enum):
    NORMAL = "NORMAL"
    EVENT = "EVENT"
    STANDBY = "STANDBY"
    SHUTDOWN = "SHUTDOWN"

@dataclass
class OptionChainData:
    """Raw option chain data from API"""
    timestamp: str = ""

    # Premium Changes
    total_call_prem_chg: float = 0.0
    total_put_prem_chg: float = 0.0

    # OI Data
    total_bullish_oi: float = 0.0    # In Crores
    total_bearish_oi: float = 0.0    # In Crores

    # OI Changes
    sb_oi_chg: float = 0.0           # Short Buildup OI Change
    lb_oi_chg: float = 0.0           # Long Buildup OI Change
    sc_oi_chg: float = 0.0           # Short Cover OI Change
    lu_oi_chg: float = 0.0           # Long Unwind OI Change

    # PCR
    pcr_oi: float = 1.0
    itm_pcr: float = 0.0

    # IV
    iv_avg: float = 0.0
    ivp: float = 0.0                 # IV Percentile (for event mode)

    # Buildup Classification
    dominant_buildup: BuildupType = BuildupType.NONE

    # NIFTY Price
    nifty_ltp: float = 0.0
    nifty_vwap: float = 0.0
    nifty_open: float = 0.0
    nifty_high: float = 0.0
    nifty_low: float = 0.0
    nifty_prev_close: float = 0.0

    # ATM Strike
    atm_strike: int = 0
    atm_ce_ltp: float = 0.0
    atm_pe_ltp: float = 0.0

    # DTE
    dte: int = 0
    expiry_date: str = ""


@dataclass
class IAEScore:
    """IAE Scoring Result"""
    total_score: int = 0

    # Individual engine scores
    is_ib_score: int = 0
    pure_oi_score: int = 0
    oi_delta_score: int = 0
    volx_score: int = 0
    gamma_score: int = 0
    mp_acceptance_score: int = 0
    tre_score: int = 0

    # Engine details
    is_ib_triggered: bool = False
    pure_oi_triggered: bool = False
    oi_delta_triggered: bool = False
    volx_triggered: bool = False
    gamma_triggered: bool = False
    mp_triggered: bool = False
    tre_triggered: bool = False

    # Direction signals from each engine
    is_ib_direction: Direction = Direction.NO_TRADE
    pure_oi_direction: Direction = Direction.NO_TRADE
    oi_delta_direction: Direction = Direction.NO_TRADE

    def get_size_multiplier(self) -> float:
        if self.total_score >= 6:
            return 1.0
        elif self.total_score == 5:
            return 0.75
        elif self.total_score == 4:
            return 0.50
        return 0.0

    def can_trade(self) -> bool:
        return self.total_score >= 4


@dataclass
class TradeSignal:
    """Complete trade signal with all parameters"""
    # Identity
    signal_id: str = ""
    timestamp: str = ""

    # Core Signal
    direction: Direction = Direction.NO_TRADE
    market_state: MarketState = MarketState.UNKNOWN
    iae_score: int = 0
    iae_breakdown: Optional[IAEScore] = None

    # Entry
    instrument: str = ""             # e.g., "NIFTY24JAN25000CE"
    strike: int = 0
    option_type: str = ""            # CE or PE
    entry_premium: float = 0.0
    entry_index_price: float = 0.0

    # Position Size
    lots: int = 0
    size_multiplier: float = 1.0
    total_premium_deployed: float = 0.0
    risk_amount: float = 0.0

    # Exit Levels
    t1_target: float = 0.0
    t2_target: float = 0.0
    sl_premium: float = 0.0
    adverse_index_sl: float = 0.0

    # T1/T2/T3 lots
    t1_lots: int = 0
    t2_lots: int = 0
    t3_lots: int = 0

    # Mode
    system_mode: SystemMode = SystemMode.NORMAL
    entry_window: str = "IB"
    dte: int = 0

    # Flags
    is_event_mode: bool = False
    is_valid: bool = False
    rejection_reason: str = ""


@dataclass
class ActivePosition:
    """Tracks an active trade"""
    signal: TradeSignal = field(default_factory=TradeSignal)

    # Status
    t1_exited: bool = False
    t2_exited: bool = False
    t3_exited: bool = False

    # T3 Trail
    t3_peak_premium: float = 0.0
    t3_trail_sl: float = 0.0

    # P&L Tracking
    t1_pnl: float = 0.0
    t2_pnl: float = 0.0
    t3_pnl: float = 0.0
    total_pnl: float = 0.0

    # Structural flip tracking
    flip_detected_time: Optional[str] = None
    flip_direction: Direction = Direction.NO_TRADE

    # Current premium
    current_premium: float = 0.0
    current_index: float = 0.0