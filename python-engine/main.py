"""
WhaleHQ v6.0 — Main Trading Engine (Complete)
Integrates: SessionManager + VWAPCalculator + ExpiryManager
"""

import time
import uuid
from datetime import datetime

from config import config
from engines.market_state import MarketStateClassifier
from engines.iae_engine import IAEEngine
from engines.direction_filter import DirectionFilter
from engines.position_sizing import PositionSizer
from engines.exit_engine import ExitEngine, ExitAction
from engines.event_capture import EventCaptureEngine
from engines.data_fetcher import DataFetcher
from engines.session_manager import SessionManager
from engines.vwap_calculator import VWAPCalculator
from engines.expiry_manager import ExpiryManager

from models.session_data import (
    MarketState, Direction, SystemMode,
    ActivePosition, TradeSignal
)
from utils.logger import setup_logger
from utils.time_utils import (
    now_ist, is_between, is_after, is_before,
    is_ib_window, is_post_ib_window,
    is_late_entry_window
)
from engines.telegram_alerts import TelegramAlerts

logger = setup_logger("WhaleHQ-Main")


class WhaleHQEngine:

    def __init__(self):
        self.telegram = TelegramAlerts()
        # ── Core Engines ──────────────────────────
        self.market_classifier = MarketStateClassifier()
        self.iae_engine = IAEEngine()
        self.direction_filter = DirectionFilter()
        self.position_sizer = PositionSizer()
        self.exit_engine = ExitEngine()
        self.event_engine = EventCaptureEngine()
        self.data_fetcher = DataFetcher()

        # ── New Critical Engines ───────────────────
        self.session_manager = SessionManager(
            config, config.NODE_SERVER_URL
        )
        self.vwap_calculator = VWAPCalculator(
            config.NODE_SERVER_URL
        )
        self.expiry_manager = ExpiryManager()

        # ── Session State ──────────────────────────
        self.market_state = MarketState.UNKNOWN
        self.system_mode = SystemMode.STANDBY
        self.active_positions: list = []
        self.ib_scored = False
        self.ib_iae = None
        self.ib_direction = Direction.NO_TRADE
        self.ib_chain = None
        self.straddle_position = None
        self.flip_detected_at = None

        logger.info("WhaleHQ v6.0 Engine Initialized")

    # ─────────────────────────────────────────────
    # MAIN RUN LOOP
    # ─────────────────────────────────────────────
    def run(self):
        logger.info("=" * 60)
        logger.info("WHALEHQ v6.0 — ENGINE STARTED")
        logger.info("=" * 60)

        # ── Step 0: Load real capital from Node.js DB ─────────────────
        # Capital is ALWAYS sourced from Zerodha available margin via DB.
        # Never use a hardcoded value — this call sets the ground truth.
        logger.info("[Startup] Fetching real trading capital from Node.js...")
        startup_config = self.data_fetcher.fetch_capital()
        real_capital = startup_config["capital"]

        if real_capital <= 0:
            logger.error(
                "[Startup] ⛔ Trading capital is 0 or not set in DB. "
                "Go to Settings → General in the WhaleHQ dashboard and sync "
                "your Zerodha balance before starting the engine."
            )
            # Keep retrying every 60s until capital is configured
            while real_capital <= 0:
                logger.info("[Startup] Waiting 60s for capital to be configured...")
                time.sleep(60)
                startup_config = self.data_fetcher.fetch_capital(retries=1)
                real_capital = startup_config["capital"]

        # Inject real capital into session manager
        self.session_manager.state.capital = real_capital
        self.session_manager.state.is_choppy_month = startup_config["isChoppyMonth"]
        self.session_manager.state.is_trend_month  = startup_config["isTrendMonth"]

        logger.info(
            f"[Startup] ✅ Capital set: ₹{real_capital:,.0f} | "
            f"Choppy={startup_config['isChoppyMonth']} | "
            f"Trend={startup_config['isTrendMonth']}"
        )

        session_info = self.expiry_manager.get_session_info()
        self.telegram.send_system_startup(
            capital=real_capital,
            expiry=session_info["expiry_formatted"],
            dte=session_info["dte"]
        )

        while True:
            try:
                now = now_ist()
                logger.info(
                    f"\n{'='*40}\n"
                    f"TICK: {now.strftime('%H:%M:%S')}\n"
                    f"{'='*40}"
                )

                # ── Step 1: Session Reset Check ────
                if self.session_manager.should_reset():
                    self._reset_new_session()

                # ── Step 2: Market Hours Check ─────
                if not self._is_market_hours():
                    logger.info("Outside market hours — sleeping")
                    time.sleep(60)
                    continue

                # ── Step 3: Fetch Market Data ──────
                chain = self._safe_fetch_chain()
                if not chain or chain.nifty_ltp == 0:
                    logger.warning("No market data — skipping tick")
                    time.sleep(60)
                    continue

                # ── Step 4: Update VWAP ────────────
                vwap = self.vwap_calculator.update_from_price(
                    chain.nifty_high,
                    chain.nifty_low,
                    chain.nifty_ltp,
                    0
                )
                chain.nifty_vwap = vwap

                # ── Step 5: Update Expiry Info ─────
                session_info = self.expiry_manager.get_session_info()
                chain.dte = session_info["dte"]
                chain.expiry_date = session_info["expiry_date"]

                logger.info(
                    f"DTE: {chain.dte} | "
                    f"Expiry: {session_info['expiry_formatted']} | "
                    f"VWAP: {vwap:.2f} | "
                    f"LTP: {chain.nifty_ltp}"
                )

                # ── Step 6: System Mode Check ──────
                if self.session_manager.state.system_mode == \
                        SystemMode.SHUTDOWN:
                    logger.warning("System SHUTDOWN — no trading")
                    self._push_state(chain)
                    time.sleep(60)
                    continue

                # ── Step 7: Daily Loss Limit ───────
                is_expiry = session_info["is_expiry_day"]
                if self.session_manager.check_daily_loss_limit(
                        is_expiry
                ):
                    self._push_state(chain)
                    time.sleep(60)
                    continue

                # ── Step 8: Event or Normal Mode ───
                event_info = self.event_engine.is_event_day(chain)
                if event_info["is_event"]:
                    self._run_event_mode(chain, event_info)
                else:
                    self._run_normal_mode(chain)

                # ── Step 9: Monitor Positions ──────
                self._monitor_positions(chain)

                # ── Step 10: EOD Force Exit ────────
                if is_after(config.FORCE_EXIT_TIME):
                    self._force_exit_all(chain)

                # ── Step 11: Push State to UI ──────
                self._push_state(chain)

                # ── Step 12: Reset Error Count ─────
                self.session_manager.reset_api_error_count()

                time.sleep(60)

            except KeyboardInterrupt:
                logger.info("Engine stopped by user")
                self._shutdown_gracefully()
                break

            except Exception as e:
                should_retry = \
                    self.session_manager.handle_api_failure(
                        e, "main_loop"
                    )
                if not should_retry:
                    logger.critical(
                        "Too many errors — emergency shutdown"
                    )
                    self.session_manager.emergency_close_all(
                        f"Too many API failures: {e}"
                    )
                    break

    # ─────────────────────────────────────────────
    # SESSION RESET
    # ─────────────────────────────────────────────
    def _reset_new_session(self):
        """Full session reset for new trading day"""
        logger.info("RESETTING SESSION FOR NEW DAY")

        # Session manager reset
        self.session_manager.reset_for_new_session()

        # VWAP reset
        self.vwap_calculator.reset()

        # Engine state reset
        self.market_state = MarketState.UNKNOWN
        self.system_mode = SystemMode.STANDBY
        self.active_positions = []
        self.ib_scored = False
        self.ib_iae = None
        self.ib_direction = Direction.NO_TRADE
        self.ib_chain = None
        self.straddle_position = None
        self.flip_detected_at = None

        logger.info("Session reset complete")

    # ─────────────────────────────────────────────
    # SAFE DATA FETCH WITH RETRY
    # ─────────────────────────────────────────────
    def _safe_fetch_chain(self):
        """Fetch chain data with error recovery"""
        max_retries = 3

        for attempt in range(max_retries):
            try:
                chain = self.data_fetcher.fetch_chain_data()
                if chain and chain.nifty_ltp > 0:
                    return chain
                logger.warning(
                    f"Empty chain data "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                time.sleep(5)

            except Exception as e:
                logger.error(
                    f"Chain fetch error "
                    f"(attempt {attempt + 1}): {e}"
                )
                if attempt < max_retries - 1:
                    time.sleep(5 * (attempt + 1))

        return None

    # ─────────────────────────────────────────────
    # NORMAL TRADING MODE
    # ─────────────────────────────────────────────
    def _run_normal_mode(self, chain):
        """Normal IAE-based directional trading"""
        self.system_mode = SystemMode.NORMAL
        state = self.session_manager.state

        # ── Gate 1: Max trades per day ─────────
        if state.trades_today >= config.MAX_TRADES_PER_DAY:
            logger.info(
                f"Max {config.MAX_TRADES_PER_DAY} trades "
                f"reached — standby"
            )
            return

        # ── Gate 2: Consecutive SL hits ────────
        if not self.session_manager.can_trade_after_consecutive_sl():
            logger.warning(
                "2 consecutive SLs — paused for day"
            )
            return

        # ── Gate 3: Stay flat check ────────────
        if self._is_stay_flat_day(chain):
            logger.warning("Stay flat condition — no trading")
            return

        # ── Gate 4: Gap rules ──────────────────
        gap_rule = self.market_classifier.get_gap_rule(chain)
        if not gap_rule["can_trade"]:
            logger.warning(
                f"Gap rule: {gap_rule['rule']} — "
                f"waiting for IB"
            )
            return

        # ── Gate 5: Already in position ────────
        if len(self.active_positions) > 0:
            logger.info(
                f"In position ({len(self.active_positions)}) "
                f"— no new entry"
            )
            return

        # ── IB Window: 09:30-09:45 ─────────────
        if is_ib_window() and not self.ib_scored:
            self._score_ib(chain)

        # ── Post-IB: 09:45-10:30 ───────────────
        elif is_post_ib_window() and self.ib_scored:
            self._attempt_entry(
                chain, window="POST_IB", min_iae=5
            )

        # ── Late Entry: 10:30-12:00 ────────────
        elif is_late_entry_window() and self.ib_scored:
            if (self.market_state == MarketState.DISCOVERY
                    and self.ib_iae
                    and self.ib_iae.total_score >= 6):
                self._attempt_entry(
                    chain, window="LATE", min_iae=6
                )

    # ─────────────────────────────────────────────
    # IB SCORING
    # ─────────────────────────────────────────────
    def _score_ib(self, chain):
        """Score IAE at IB close (09:30-09:45)"""
        logger.info("▶ IB WINDOW — Scoring IAE...")

        self.ib_chain = chain
        self.market_state = self.market_classifier.classify(chain)
        self.ib_iae = self.iae_engine.score(
            chain, chain.dte
        )
        self.ib_direction = \
            self.direction_filter.determine_direction(
                chain, self.ib_iae
            )

        # Store in session
        self.session_manager.state.market_state = \
            self.market_state
        self.session_manager.state.direction = \
            self.ib_direction
        self.session_manager.state.ib_scored = True
        self.session_manager.state.ib_score_time = \
            now_ist().strftime("%H:%M:%S")

        logger.info(
            f"\n{'─'*40}\n"
            f"IB SCORE RESULT\n"
            f"  State:     {self.market_state.value}\n"
            f"  IAE Score: {self.ib_iae.total_score}/8\n"
            f"  Direction: {self.ib_direction.value}\n"
            f"  Can Trade: {self.ib_iae.can_trade()}\n"
            f"{'─'*40}"
        )

        self.telegram.send_iae_score(
            iae_score=self.ib_iae.total_score,
            market_state=self.market_state.value,
            direction=self.ib_direction.value,
            breakdown={
                "isIb": self.ib_iae.is_ib_score,
                "pureOI": self.ib_iae.pure_oi_score,
                "oiDelta": self.ib_iae.oi_delta_score,
                "volX": self.ib_iae.volx_score,
                "gamma": self.ib_iae.gamma_score,
                "mp": self.ib_iae.mp_acceptance_score,
                "tre": self.ib_iae.tre_score,
            },
            can_trade=self.ib_iae.can_trade()
        )

        # Attempt IB entry immediately
        self._attempt_entry(chain, window="IB", min_iae=4)
        self.ib_scored = True

    # ─────────────────────────────────────────────
    # ENTRY LOGIC
    # ─────────────────────────────────────────────
    def _attempt_entry(
            self,
            chain,
            window: str,
            min_iae: int
    ):
        """Attempt trade entry with all gate checks"""
        if not self.ib_iae:
            return

        state = self.session_manager.state
        iae = self.ib_iae
        direction = self.ib_direction

        # ── Check 1: IAE minimum ───────────────
        effective_min = min_iae
        if state.is_choppy_month:
            effective_min = max(min_iae, 5)

        if iae.total_score < effective_min:
            logger.info(
                f"IAE {iae.total_score} < {effective_min} "
                f"({window}) — no trade"
            )
            return

        # ── Check 2: Direction ─────────────────
        if direction == Direction.NO_TRADE:
            logger.info("No direction confirmed — no trade")
            return

        # ── Check 3: Market state ──────────────
        if (self.market_state == MarketState.BALANCE
                and iae.total_score < 6):
            logger.info(
                "BALANCE + IAE < 6 — standby"
            )
            return

        # ── Check 4: DTE rules ─────────────────
        if chain.dte == 1 and iae.total_score < 6:
            logger.info("DTE=1 requires IAE 6+ — blocked")
            return

        if chain.dte == 0:
            expiry_info = self.expiry_manager.get_session_info()
            if is_after(config.THETA_KILL_TIME):
                logger.info(
                    "Theta Kill active — no entry"
                )
                return

        # ── Check 5: Gap direction ─────────────
        gap_rule = self.market_classifier.get_gap_rule(chain)
        if gap_rule.get("requires_buildup_confirmation"):
            if direction == Direction.NO_TRADE:
                logger.info(
                    "Gap against buildup — no trade"
                )
                return

        # ── Check 6: After-win size reduction ──
        size_mult = iae.get_size_multiplier()
        size_mult = \
            self.session_manager.get_size_multiplier_after_wins(
                size_mult
            )

        # ── Calculate Position ─────────────────
        signal = self.position_sizer.calculate(
            direction=direction,
            iae=iae,
            chain=chain,
            market_state=self.market_state,
            dte=chain.dte,
            current_capital=state.capital
        )

        if not signal.is_valid:
            logger.warning(
                f"Invalid signal: {signal.rejection_reason}"
            )
            return

        # Override size with session-adjusted multiplier
        signal.size_multiplier = size_mult
        signal.signal_id = str(uuid.uuid4())
        signal.timestamp = now_ist().isoformat()
        signal.entry_window = window

        # ── Send Signal to Node.js ─────────────
        self._send_entry_signal(signal, chain)

    def _send_entry_signal(self, signal, chain):
        """Send entry signal to Node.js"""
        payload = {
            "signalId": signal.signal_id,
            "direction": signal.direction.value,
            "optionType": signal.option_type,
            "strike": signal.strike,
            "expiry": chain.expiry_date,
            "entryPremium": signal.entry_premium,
            "entryIndexPrice": signal.entry_index_price,
            "lots": signal.lots,
            "t1Lots": signal.t1_lots,
            "t2Lots": signal.t2_lots,
            "t3Lots": signal.t3_lots,
            "t1Target": signal.t1_target,
            "t2Target": signal.t2_target,
            "slPremium": signal.sl_premium,
            "adverseIndexSL": signal.adverse_index_sl,
            "iaeScore": signal.iae_score,
            "marketState": signal.market_state.value,
            "entryWindow": signal.entry_window,
            "capitalDeployed": signal.total_premium_deployed,
            "riskAmount": signal.risk_amount,
            "sizeMultiplier": signal.size_multiplier,
            "dte": signal.dte,
        }

        response = self.data_fetcher.send_signal(payload)

        if response.get("success"):
            # Track locally
            position = ActivePosition()
            position.signal = signal
            position.current_premium = signal.entry_premium
            position.current_index = chain.nifty_ltp
            self.active_positions.append(position)

            # Update session state
            self.session_manager.state.trades_today += 1

            logger.info(
                f"✅ TRADE ENTERED\n"
                f"  {signal.direction.value} {signal.option_type} "
                f"{signal.strike}\n"
                f"  IAE: {signal.iae_score} | "
                f"Lots: {signal.lots} | "
                f"Premium: ₹{signal.entry_premium}\n"
                f"  T1: ₹{signal.t1_target} | "
                f"T2: ₹{signal.t2_target} | "
                f"SL: ₹{signal.sl_premium}"
            )

            self.telegram.send_trade_entry(
                direction=signal.direction.value,
                option_type=signal.option_type,
                strike=signal.strike,
                premium=signal.entry_premium,
                lots=signal.lots,
                iae_score=signal.iae_score,
                market_state=signal.market_state.value,
                t1_target=signal.t1_target,
                t2_target=signal.t2_target,
                sl_premium=signal.sl_premium,
                capital_deployed=signal.total_premium_deployed,
                risk_amount=signal.risk_amount,
                entry_window=signal.entry_window
            )
        else:
            # Handle order rejection
            rejection = response.get("error", "Unknown error")
            action = self.session_manager.handle_order_rejection(
                signal, rejection
            )
            logger.error(
                f"Entry failed: {rejection} | "
                f"Action: {action.get('action')}"
            )

    # ─────────────────────────────────────────────
    # POSITION MONITORING
    # ─────────────────────────────────────────────
    def _monitor_positions(self, chain):
        """Monitor all active positions every tick"""
        if not self.active_positions:
            return

        positions_to_remove = []

        for idx, position in enumerate(self.active_positions):
            try:
                # Get current premium
                if position.signal.option_type == "CE":
                    current_premium = chain.atm_ce_ltp
                else:
                    current_premium = chain.atm_pe_ltp

                current_index = chain.nifty_ltp

                # Check structural flip
                if self.ib_iae:
                    self._check_structural_flip(
                        position, chain
                    )

                # Evaluate exit conditions
                is_expiry = self.expiry_manager.is_expiry_day()
                actions = self.exit_engine.evaluate(
                    position=position,
                    current_premium=current_premium,
                    current_index=current_index,
                    is_expiry_day=is_expiry,
                    is_choppy_month= \
                        self.session_manager.state.is_choppy_month,
                    is_trend_month= \
                        self.session_manager.state.is_trend_month
                )

                # Execute each action
                for action in actions:
                    pnl = self._execute_exit_action(
                        action, position,
                        current_premium, chain
                    )

                    # Update P&L
                    if pnl != 0:
                        self.session_manager.update_pnl(pnl)

                    # Full close actions
                    if action in [
                        ExitAction.EXIT_ALL_SL,
                        ExitAction.EXIT_ALL_FORCE,
                        ExitAction.EXIT_ALL_ADVERSE,
                        ExitAction.EXIT_T3_TRAIL,
                    ]:
                        if action == ExitAction.EXIT_ALL_SL:
                            self.session_manager.record_sl_hit()
                        else:
                            self.session_manager.record_win()

                        positions_to_remove.append(idx)
                        break

            except Exception as e:
                logger.error(
                    f"Position monitor error: {e}",
                    exc_info=True
                )

        # Remove closed positions (reverse order)
        for idx in sorted(positions_to_remove, reverse=True):
            if idx < len(self.active_positions):
                self.active_positions.pop(idx)

    def _execute_exit_action(
            self,
            action: ExitAction,
            position: ActivePosition,
            current_premium: float,
            chain
    ) -> float:
        """Execute exit and return P&L"""
        signal = position.signal

        exit_configs = {
            ExitAction.EXIT_T1: {
                "type": "T1",
                "lots": signal.t1_lots,
                "reason": "T1 +40% target hit"
            },
            ExitAction.EXIT_T2: {
                "type": "T2",
                "lots": signal.t2_lots,
                "reason": "T2 +80% target hit"
            },
            ExitAction.EXIT_T3_TRAIL: {
                "type": "T3_TRAIL",
                "lots": signal.t3_lots,
                "reason": "T3 trail SL hit"
            },
            ExitAction.EXIT_ALL_SL: {
                "type": "SL",
                "lots": signal.lots,
                "reason": "Premium SL -32%"
            },
            ExitAction.EXIT_ALL_ADVERSE: {
                "type": "ADVERSE_SL",
                "lots": signal.lots,
                "reason": "Adverse index move 0.5%"
            },
            ExitAction.EXIT_ALL_FORCE: {
                "type": "FORCE",
                "lots": signal.lots,
                "reason": "Force exit 15:15"
            },
        }

        exit_cfg = exit_configs.get(action)
        if not exit_cfg:
            return 0.0

        exit_data = {
            **exit_cfg,
            "signalId": signal.signal_id,
            "strike": signal.strike,
            "optionType": signal.option_type,
            "expiry": chain.expiry_date,
            "exitPremium": current_premium,
        }

        response = self.data_fetcher.send_exit_signal(exit_data)

        # Calculate P&L
        pnl = (
                (current_premium - signal.entry_premium)
                * exit_cfg["lots"]
                * config.LOT_SIZE
        )

        logger.info(
            f"EXIT: {action.value} | "
            f"Lots: {exit_cfg['lots']} | "
            f"Premium: {current_premium} | "
            f"P&L: {'+' if pnl >= 0 else ''}₹{pnl:,.0f}"
        )

        if action == ExitAction.EXIT_T1:
            self.telegram.send_t1_exit(
                direction=signal.direction.value,
                option_type=signal.option_type,
                strike=signal.strike,
                entry_premium=signal.entry_premium,
                exit_premium=current_premium,
                lots=exit_cfg["lots"],
                pnl=pnl
            )
        elif action == ExitAction.EXIT_T2:
            self.telegram.send_t2_exit(
                direction=signal.direction.value,
                option_type=signal.option_type,
                strike=signal.strike,
                entry_premium=signal.entry_premium,
                exit_premium=current_premium,
                lots=exit_cfg["lots"],
                pnl=pnl,
                t3_trail_sl=position.t3_trail_sl
            )
        elif action == ExitAction.EXIT_T3_TRAIL:
            self.telegram.send_t3_trail_exit(
                direction=signal.direction.value,
                option_type=signal.option_type,
                strike=signal.strike,
                entry_premium=signal.entry_premium,
                peak_premium=position.t3_peak_premium,
                exit_premium=current_premium,
                lots=exit_cfg["lots"],
                t3_pnl=pnl,
                total_pnl=self.session_manager.state.daily_pnl
            )
        elif action == ExitAction.EXIT_ALL_SL:
            self.telegram.send_sl_hit(
                direction=signal.direction.value,
                option_type=signal.option_type,
                strike=signal.strike,
                entry_premium=signal.entry_premium,
                exit_premium=current_premium,
                lots=exit_cfg["lots"],
                pnl=pnl,
                sl_type="Premium SL -32%",
                consecutive_sl=\
                    self.session_manager.state.consecutive_sl_hits
            )

        return pnl

    # ─────────────────────────────────────────────
    # STRUCTURAL FLIP CHECK
    # ─────────────────────────────────────────────
    def _check_structural_flip(self, position, chain):
        """Monitor OI structure flip after entry"""
        if not self.ib_iae:
            return

        flip_result = self.direction_filter.check_structural_flip(
            original_direction=position.signal.direction,
            chain=chain,
            iae=self.ib_iae
        )

        if flip_result["flip"]:
            if self.flip_detected_at is None:
                self.flip_detected_at = now_ist()
                logger.warning(
                    f"FLIP DETECTED: {flip_result['reason']}"
                )

            if flip_result["action"] == "EXIT_T1_TIGHTEN":
                if not position.t1_exited:
                    premium = (
                        chain.atm_ce_ltp
                        if position.signal.option_type == "CE"
                        else chain.atm_pe_ltp
                    )
                    self._execute_exit_action(
                        ExitAction.EXIT_T1,
                        position,
                        premium,
                        chain
                    )
                self.exit_engine.tighten_trail(position)
        else:
            # Flip resolved
            self.flip_detected_at = None

    # ─────────────────────────────────────────────
    # EVENT MODE
    # ─────────────────────────────────────────────
    def _run_event_mode(self, chain, event_info: dict):
        """Event mode: Straddle + Momentum"""
        self.system_mode = SystemMode.EVENT
        state = self.session_manager.state

        logger.info(
            f"EVENT MODE: {event_info['event_name']} | "
            f"IVP: {event_info['ivp']}"
        )

        # ── Strategy 1: Pre-event Straddle ─────
        if (is_between("09:20", "09:25")
                and self.straddle_position is None
                and chain.dte > 0):

            straddle = self.event_engine.calculate_straddle_signal(
                chain, state.capital, chain.dte
            )

            if straddle["valid"]:
                response = self.data_fetcher.send_signal({
                    "type": "STRADDLE",
                    "expiry": chain.expiry_date,
                    **straddle,
                })

                if response.get("success"):
                    self.straddle_position = straddle
                    state.trades_today += 1
                    logger.info("STRADDLE ENTERED")

        # ── Strategy 2: Post-event Momentum ────
        if (self.ib_iae
                and self.ib_direction != Direction.NO_TRADE
                and state.trades_today < config.MAX_TRADES_PER_DAY
                and len(self.active_positions) == 0):

            flip_mins = self._get_flip_confirmed_minutes()

            momentum = self.event_engine.calculate_momentum_signal(
                chain=chain,
                iae_score=self.ib_iae.total_score,
                direction=self.ib_direction,
                current_capital=state.capital,
                flip_confirmed_minutes=flip_mins
            )

            if momentum["valid"]:
                response = self.data_fetcher.send_signal({
                    "type": "MOMENTUM",
                    "expiry": chain.expiry_date,
                    **momentum,
                })
                if response.get("success"):
                    state.trades_today += 1
                    logger.info(
                        f"MOMENTUM TRADE: "
                        f"{momentum['direction']}"
                    )

    # ─────────────────────────────────────────────
    # FORCE EXIT ALL
    # ─────────────────────────────────────────────
    def _force_exit_all(self, chain):
        """Force exit all positions at 15:15"""
        if not self.active_positions:
            return

        logger.info("FORCE EXIT ALL — 15:15 reached")

        for position in self.active_positions:
            premium = (
                chain.atm_ce_ltp
                if position.signal.option_type == "CE"
                else chain.atm_pe_ltp
            )
            pnl = self._execute_exit_action(
                ExitAction.EXIT_ALL_FORCE,
                position,
                premium,
                chain
            )
            self.session_manager.update_pnl(pnl)

        self.active_positions = []

        # Update EOD capital (capture start capital before update for logging)
        capital_start = self.session_manager.state.capital
        self.session_manager.update_capital_end_of_day()

        self.telegram.send_daily_summary(
            date=now_ist().strftime("%d %b %Y"),
            trades=self.session_manager.state.trades_today,
            wins=self.session_manager.state.consecutive_wins,
            losses=self.session_manager.state.consecutive_sl_hits,
            total_pnl=self.session_manager.state.daily_pnl,
            capital_start=capital_start,
            capital_end=self.session_manager.state.capital,
            market_state=self.market_state.value,
            iae_score=(
                self.ib_iae.total_score if self.ib_iae else 0
            )
        )

    # ─────────────────────────────────────────────
    # HELPER METHODS
    # ─────────────────────────────────────────────
    def _is_market_hours(self) -> bool:
        return is_between("09:15", "15:30")

    def _is_stay_flat_day(self, chain) -> bool:
        """Check stay flat conditions"""
        today = now_ist().strftime("%Y-%m-%d")

        stay_flat_dates = {
            "2026-02-01": "Union Budget",
            "2026-07-01": "US Fed Day",
        }

        if today in stay_flat_dates:
            logger.warning(
                f"STAY FLAT: {stay_flat_dates[today]}"
            )
            return True

        # Extreme gap > 1.5%
        if chain.nifty_prev_close > 0:
            gap = abs(
                chain.nifty_open - chain.nifty_prev_close
            ) / chain.nifty_prev_close
            if gap > 0.015:
                logger.warning(
                    f"STAY FLAT: Extreme gap {gap*100:.1f}%"
                )
                return True

        return False

    def _get_flip_confirmed_minutes(self) -> int:
        if self.flip_detected_at is None:
            return 0
        elapsed = (
                          now_ist() - self.flip_detected_at
                  ).seconds // 60
        return elapsed

    def _push_state(self, chain):
        """Push complete engine state to Node.js for UI"""
        state = self.session_manager.state

        self.data_fetcher.update_session_state({
            "timestamp": now_ist().isoformat(),
            "systemMode": self.system_mode.value,
            "marketState": self.market_state.value,
            "iaeScore": (
                self.ib_iae.total_score
                if self.ib_iae else 0
            ),
            "iaeBreakdown": {
                "isIb": (
                    self.ib_iae.is_ib_score
                    if self.ib_iae else 0
                ),
                "pureOI": (
                    self.ib_iae.pure_oi_score
                    if self.ib_iae else 0
                ),
                "oiDelta": (
                    self.ib_iae.oi_delta_score
                    if self.ib_iae else 0
                ),
                "volX": (
                    self.ib_iae.volx_score
                    if self.ib_iae else 0
                ),
                "gamma": (
                    self.ib_iae.gamma_score
                    if self.ib_iae else 0
                ),
                "mp": (
                    self.ib_iae.mp_acceptance_score
                    if self.ib_iae else 0
                ),
                "tre": (
                    self.ib_iae.tre_score
                    if self.ib_iae else 0
                ),
            },
            "direction": self.ib_direction.value,
            "activePositions": len(self.active_positions),
            "tradesToday": state.trades_today,
            "dailyPnL": state.daily_pnl,
            "capital": state.capital,
            "niftyLTP": chain.nifty_ltp,
            "niftyVWAP": chain.nifty_vwap,
            "pcr": chain.pcr_oi,
            "dte": chain.dte,
            "expiry": chain.expiry_date,
            "ibScored": self.ib_scored,
            "consecutiveSLHits": state.consecutive_sl_hits,
            "consecutiveWins": state.consecutive_wins,
            "isChoppyMonth": state.is_choppy_month,
            "isTrendMonth": state.is_trend_month,
        })

    def _shutdown_gracefully(self):
        """Clean shutdown"""
        logger.info("Graceful shutdown initiated")
        self.session_manager.update_capital_end_of_day()


if __name__ == "__main__":
    engine = WhaleHQEngine()
    engine.run()