from models.session_data import (
    OptionChainData, IAEScore, Direction, BuildupType
)
from config import config
from utils.logger import setup_logger
import math

logger = setup_logger("IAEEngine")

class IAEEngine:
    """
    Institutional Aggression Engine v2.0
    Scores 0-8 across 7 independent engines
    Minimum 4 to trade
    """

    def score(self, chain: OptionChainData, dte: int) -> IAEScore:
        result = IAEScore()

        logger.info("=" * 50)
        logger.info("IAE SCORING ENGINE — STARTING")
        logger.info("=" * 50)

        # Engine 1: IS/IB Engine (+2)
        result = self._score_is_ib(chain, result)

        # Engine 2: Pure OI Engine (+2)
        result = self._score_pure_oi(chain, result)

        # Engine 3: OI Delta Engine (+1)
        result = self._score_oi_delta(chain, result)

        # Engine 4: VolX Engine (+1)
        result = self._score_volx(chain, result)

        # Engine 5: Gamma Engine (+1)
        result = self._score_gamma(chain, result, dte)

        # Engine 6: MP Acceptance (+1)
        result = self._score_mp_acceptance(chain, result)

        # Engine 7: TRE Engine (+1)
        result = self._score_tre(chain, result)

        # Final Score
        result.total_score = (
                result.is_ib_score +
                result.pure_oi_score +
                result.oi_delta_score +
                result.volx_score +
                result.gamma_score +
                result.mp_acceptance_score +
                result.tre_score
        )

        logger.info(f"IAE FINAL SCORE: {result.total_score}/8")
        logger.info(
            f"Breakdown → IS/IB:{result.is_ib_score} | "
            f"PureOI:{result.pure_oi_score} | "
            f"OIDelta:{result.oi_delta_score} | "
            f"VolX:{result.volx_score} | "
            f"Gamma:{result.gamma_score} | "
            f"MP:{result.mp_acceptance_score} | "
            f"TRE:{result.tre_score}"
        )

        return result

    def _score_is_ib(
            self, chain: OptionChainData, result: IAEScore
    ) -> IAEScore:
        """
        IS/IB Engine: +2 if |Call Prem Chg| > 80 OR |Put Prem Chg| > 80
        Most powerful engine — never skip
        """
        call_chg = abs(chain.total_call_prem_chg)
        put_chg = abs(chain.total_put_prem_chg)
        threshold = config.IS_IB_PREMIUM_THRESHOLD

        if call_chg > threshold or put_chg > threshold:
            result.is_ib_score = 2
            result.is_ib_triggered = True

            # Determine direction
            if call_chg > threshold and put_chg > threshold:
                # Both firing — use the stronger one
                if call_chg > put_chg:
                    result.is_ib_direction = Direction.BULL
                else:
                    result.is_ib_direction = Direction.BEAR
            elif call_chg > threshold:
                result.is_ib_direction = Direction.BULL
            else:
                result.is_ib_direction = Direction.BEAR

            logger.info(
                f"✅ IS/IB Engine: +2 | "
                f"Call Chg: {chain.total_call_prem_chg:.0f} | "
                f"Put Chg: {chain.total_put_prem_chg:.0f} | "
                f"Direction: {result.is_ib_direction.value}"
            )
        else:
            result.is_ib_score = 0
            logger.info(
                f"❌ IS/IB Engine: 0 | "
                f"Call Chg: {chain.total_call_prem_chg:.0f} | "
                f"Put Chg: {chain.total_put_prem_chg:.0f} | "
                f"Threshold: {threshold}"
            )

        return result

    def _score_pure_oi(
            self, chain: OptionChainData, result: IAEScore
    ) -> IAEScore:
        """
        Pure OI Engine: +2 if one side has ZERO OI
        Maximum conviction signal — upgraded to +2 after 8-Jan validation
        """
        bull_oi = chain.total_bullish_oi
        bear_oi = chain.total_bearish_oi
        threshold = config.PURE_OI_BEARISH_THRESHOLD

        # Pure Bear: Zero bullish OI + heavy bearish
        if bull_oi == 0 and bear_oi > threshold:
            result.pure_oi_score = 2
            result.pure_oi_triggered = True
            result.pure_oi_direction = Direction.BEAR
            logger.info(
                f"✅ Pure OI Engine: +2 | "
                f"PURE BEAR | Bull OI: 0 | "
                f"Bear OI: {bear_oi:.0f}Cr"
            )

        # Pure Bull: Zero bearish OI
        elif bear_oi == 0 and bull_oi > threshold:
            result.pure_oi_score = 2
            result.pure_oi_triggered = True
            result.pure_oi_direction = Direction.BULL
            logger.info(
                f"✅ Pure OI Engine: +2 | "
                f"PURE BULL | Bear OI: 0 | "
                f"Bull OI: {bull_oi:.0f}Cr"
            )

        else:
            result.pure_oi_score = 0
            logger.info(
                f"❌ Pure OI Engine: 0 | "
                f"Bull OI: {bull_oi:.0f}Cr | "
                f"Bear OI: {bear_oi:.0f}Cr | "
                f"Both present = no signal"
            )

        return result

    def _score_oi_delta(
            self, chain: OptionChainData, result: IAEScore
    ) -> IAEScore:
        """
        OI Delta Engine: +1 if fresh institutional positioning > 100Cr
        """
        threshold = config.OI_DELTA_THRESHOLD

        bear_oi_chg = chain.sb_oi_chg
        bull_oi_chg = chain.lb_oi_chg + chain.sc_oi_chg

        if bear_oi_chg > threshold or bull_oi_chg > threshold:
            result.oi_delta_score = 1
            result.oi_delta_triggered = True

            if bear_oi_chg > bull_oi_chg:
                result.oi_delta_direction = Direction.BEAR
            else:
                result.oi_delta_direction = Direction.BULL

            logger.info(
                f"✅ OI Delta Engine: +1 | "
                f"Bear OI Chg: {bear_oi_chg:.0f}Cr | "
                f"Bull OI Chg: {bull_oi_chg:.0f}Cr | "
                f"Direction: {result.oi_delta_direction.value}"
            )
        else:
            result.oi_delta_score = 0
            logger.info(
                f"❌ OI Delta Engine: 0 | "
                f"Bear Chg: {bear_oi_chg:.0f}Cr | "
                f"Bull Chg: {bull_oi_chg:.0f}Cr | "
                f"Below 100Cr threshold"
            )

        return result

    def _score_volx(
            self, chain: OptionChainData, result: IAEScore
    ) -> IAEScore:
        """
        VolX Engine: +1 if PCR is not balanced
        PCR < 0.75 = Bear pressure | PCR > 1.30 = Bull support
        """
        pcr = chain.pcr_oi

        if pcr < config.PCR_BEAR_THRESHOLD:
            result.volx_score = 1
            result.volx_triggered = True
            logger.info(
                f"✅ VolX Engine: +1 | PCR: {pcr:.2f} | "
                f"CE HEAVY → BEAR pressure"
            )
        elif pcr > config.PCR_BULL_THRESHOLD:
            result.volx_score = 1
            result.volx_triggered = True
            logger.info(
                f"✅ VolX Engine: +1 | PCR: {pcr:.2f} | "
                f"PE HEAVY → BULL support"
            )
        else:
            result.volx_score = 0
            logger.info(
                f"❌ VolX Engine: 0 | PCR: {pcr:.2f} | "
                f"Balanced (0.75-1.30) = no signal"
            )

        return result

    def _score_gamma(
            self, chain: OptionChainData, result: IAEScore, dte: int
    ) -> IAEScore:
        """
        Gamma Engine: +1 if pre-expiry amplification active
        IV > 9% with DTE <= 2 OR ITM PCR > 2.5
        """
        iv = chain.iv_avg
        itm_pcr = chain.itm_pcr

        gamma_via_iv = (iv > config.IV_THRESHOLD and dte <= 2)
        gamma_via_itm = (itm_pcr > config.ITM_PCR_THRESHOLD)

        if gamma_via_iv or gamma_via_itm:
            result.gamma_score = 1
            result.gamma_triggered = True
            reason = []
            if gamma_via_iv:
                reason.append(f"IV={iv:.1f}% DTE={dte}")
            if gamma_via_itm:
                reason.append(f"ITM PCR={itm_pcr:.2f}")
            logger.info(
                f"✅ Gamma Engine: +1 | {' | '.join(reason)}"
            )
        else:
            result.gamma_score = 0
            logger.info(
                f"❌ Gamma Engine: 0 | "
                f"IV: {iv:.1f}% | DTE: {dte} | ITM PCR: {itm_pcr:.2f}"
            )

        return result

    def _score_mp_acceptance(
            self, chain: OptionChainData, result: IAEScore
    ) -> IAEScore:
        """
        MP Acceptance: +1 if price accepting new territory
        Close > VWAP = BULL | Close < VWAP = BEAR
        """
        ltp = chain.nifty_ltp
        vwap = chain.nifty_vwap

        if vwap == 0:
            result.mp_acceptance_score = 0
            logger.info("❌ MP Engine: 0 | VWAP not available")
            return result

        diff_pct = abs((ltp - vwap) / vwap) * 100

        # Only count if meaningful difference (not just tick away)
        if diff_pct > 0.05:
            result.mp_acceptance_score = 1
            result.mp_triggered = True
            direction = "BULL" if ltp > vwap else "BEAR"
            logger.info(
                f"✅ MP Engine: +1 | "
                f"LTP: {ltp:.0f} | VWAP: {vwap:.0f} | "
                f"Diff: {diff_pct:.2f}% → {direction}"
            )
        else:
            result.mp_acceptance_score = 0
            logger.info(
                f"❌ MP Engine: 0 | "
                f"LTP ≈ VWAP (diff: {diff_pct:.3f}%) | No acceptance"
            )

        return result

    def _score_tre(
            self, chain: OptionChainData, result: IAEScore
    ) -> IAEScore:
        """
        TRE Engine: +1 if Trap Reversal Entry setup
        Day range > 2.5x body AND |chg%| < 0.4%
        """
        high = chain.nifty_high
        low = chain.nifty_low
        open_ = chain.nifty_open
        close = chain.nifty_ltp

        if open_ == 0:
            result.tre_score = 0
            return result

        day_range = high - low
        body = abs(close - open_)
        change_pct = abs((close - open_) / open_) * 100

        if body == 0:
            result.tre_score = 0
            return result

        range_to_body = day_range / body

        if range_to_body > 2.5 and change_pct < 0.4:
            result.tre_score = 1
            result.tre_triggered = True
            logger.info(
                f"✅ TRE Engine: +1 | "
                f"Range/Body: {range_to_body:.1f}x | "
                f"Change: {change_pct:.2f}% | "
                f"Trap setup detected"
            )
        else:
            result.tre_score = 0
            logger.info(
                f"❌ TRE Engine: 0 | "
                f"Range/Body: {range_to_body:.1f}x (need >2.5x) | "
                f"Change: {change_pct:.2f}% (need <0.4%)"
            )

        return result