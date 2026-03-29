import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

@dataclass
class WhaleHQConfig:
    # Capital — sourced from Zerodha real margin via Node.js DB (set to 0 = use DB value)
    CAPITAL: float = float(os.getenv("CAPITAL", 0))

    # Risk Parameters
    RISK_PCT: float = 0.025          # 2.5% risk per trade
    SL_PCT: float = 0.32             # 32% SL from entry premium
    ADVERSE_PCT: float = 0.005       # 0.5% adverse index move
    DAILY_LOSS_LIMIT: float = 0.06   # 6% daily loss limit
    EXPIRY_DAILY_LOSS_LIMIT: float = 0.04  # 4% on expiry day
    EVENT_DAILY_LOSS_LIMIT: float = 0.08   # 8% on event day
    MAX_PREMIUM_DEPLOYED: float = 0.15     # 15% max per trade
    MAX_TRADES_PER_DAY: int = 2

    # Exit Targets
    T1_TARGET: float = 0.40          # +40% for T1
    T2_TARGET: float = 0.80          # +80% for T2
    T3_TRAIL_PCT: float = 0.20       # 20% trail for T3

    # Lot — must match node-server LOT_SIZE env var
    LOT_SIZE: int = int(os.getenv("LOT_SIZE", 65))

    # Timing (IST)
    IB_START: str = "09:30"
    IB_END: str = "09:45"
    POST_IB_END: str = "10:30"
    LATE_ENTRY_END: str = "12:00"
    THETA_KILL_TIME: str = "13:30"   # Expiry day only
    FORCE_EXIT_TIME: str = "15:15"

    # IAE Thresholds
    MIN_IAE: int = 4
    IS_IB_PREMIUM_THRESHOLD: int = 80
    OI_DELTA_THRESHOLD: int = 100    # 100Cr
    PURE_OI_BEARISH_THRESHOLD: int = 200  # 200Cr
    PCR_BEAR_THRESHOLD: float = 0.75
    PCR_BULL_THRESHOLD: float = 1.30
    ITM_PCR_THRESHOLD: float = 2.5
    IV_THRESHOLD: float = 9.0

    # Gap Rules
    GAP_MODERATE: float = 0.008      # 0.8%
    GAP_EXTREME: float = 0.015       # 1.5%

    # Event Mode
    EVENT_IVP_TRIGGER: int = 90
    HIGH_EVENT_IVP: int = 95
    STRADDLE_SIZE_PCT: float = 0.03
    STRADDLE_MAX_DEPLOYED: float = 0.20
    STRADDLE_LOCK_TRIGGER: float = 1.00
    STRADDLE_TRAIL: float = 0.20
    STRADDLE_LOSING_SL: float = 0.50
    MOMENTUM_IAE_MIN: int = 3
    MOMENTUM_SIZE: float = 0.75
    MOMENTUM_TRAIL: float = 0.15
    FLIP_CONFIRM_MINUTES: int = 15
    MAX_EVENT_DEPLOYED: float = 0.30

    # API
    NODE_SERVER_URL: str = os.getenv("NODE_SERVER_URL", "http://localhost:4000")
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017/whalehq")

config = WhaleHQConfig()