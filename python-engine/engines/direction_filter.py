from models.session_data import (
    OptionChainData, IAEScore, Direction, BuildupType
)
from utils.logger import setup_logger

logger = setup_logger("DirectionFilter")

class DirectionFilter:
    """
    Determines trade direction in strict priority order:
    1. Buildup Classification (highest priority)
    2. Pure OI Structure
    3. Premium Direction (tiebreaker)
    """

    def determine_direction(
            self, chain: OptionChainData, iae: IAEScore
    ) -> Direction:

        logger.info("DIRECTION FILTER — STARTING")

        # Step 1: Buildup Classification
        buildup_direction = self._buildup_direction(chain)

        if buildup_direction != Direction.NO_TRADE:
            logger.info(
                f"Direction from BUILDUP: {buildup_direction.value}"
            )

            # Cross-validate with Pure OI if available
            if iae.pure_oi_triggered:
                if iae.pure_oi_direction != buildup_direction:
                    logger.warning(
                        "CONFLICT: Buildup vs Pure OI disagree → NO TRADE"
                    )
                    return Direction.NO_TRADE

            return buildup_direction

        # Step 2: Pure OI Structure
        if iae.pure_oi_triggered:
            logger.info(
                f"Direction from PURE OI: {iae.pure_oi_direction.value}"
            )
            return iae.pure_oi_direction

        # Step 3: Premium Direction (tiebreaker)
        premium_direction = self._premium_direction(chain)
        if premium_direction != Direction.NO_TRADE:
            logger.info(
                f"Direction from PREMIUM: {premium_direction.value}"
            )
            return premium_direction

        logger.info("Direction: NO TRADE — no clear signal")
        return Direction.NO_TRADE

    def _buildup_direction(self, chain: OptionChainData) -> Direction:
        """
        BULL: Pure LB, SC dominant, or LB+SC together
        BEAR: Pure SB, SB+LU
        MIXED (SB+SC or LB+SB): NO TRADE
        """
        buildup = chain.dominant_buildup

        # Pure Bull signals
        if buildup in [BuildupType.LB, BuildupType.SC]:
            return Direction.BULL

        # Pure Bear signals
        if buildup == BuildupType.SB:
            return Direction.BEAR

        # LU alone = bear (Long Unwind = longs exiting)
        if buildup == BuildupType.LU:
            return Direction.BEAR

        # Mixed = NO TRADE
        if buildup == BuildupType.MIXED:
            logger.warning("Mixed buildup detected → NO TRADE")
            return Direction.NO_TRADE

        return Direction.NO_TRADE

    def _premium_direction(self, chain: OptionChainData) -> Direction:
        """
        Tiebreaker: Premium movement direction
        Calls losing + Puts gaining → BEAR
        Calls gaining + Puts losing → BULL
        Both flat or both moving same way → NO TRADE
        """
        call_chg = chain.total_call_prem_chg
        put_chg = chain.total_put_prem_chg

        call_gaining = call_chg > 20
        call_losing = call_chg < -20
        put_gaining = put_chg > 20
        put_losing = put_chg < -20

        if call_losing and put_gaining:
            return Direction.BEAR
        elif call_gaining and put_losing:
            return Direction.BULL

        logger.info(
            f"Premium tiebreaker: no clear signal | "
            f"Call chg: {call_chg:.0f} | Put chg: {put_chg:.0f}"
        )
        return Direction.NO_TRADE

    def check_structural_flip(
            self,
            original_direction: Direction,
            chain: OptionChainData,
            iae: IAEScore
    ) -> dict:
        """
        Structural Flip Rule (from 9-Jan analysis):
        If OI polarity flips BEFORE 10:30 but premium
        contradicts the flip — ignore the flip, hold position
        """
        current_direction = self.determine_direction(chain, iae)

        if current_direction == original_direction:
            return {"flip": False, "action": "HOLD"}

        # Flip detected — check premium direction
        premium_direction = self._premium_direction(chain)

        if premium_direction == original_direction:
            # Premium still confirms original — institutional short covering
            logger.info(
                "Structural flip detected BUT premium confirms original → "
                "HOLD (institutional short covering)"
            )
            return {
                "flip": True,
                "action": "HOLD",
                "reason": "Premium contradicts flip = short covering"
            }

        elif premium_direction == current_direction:
            # Both OI AND premium flipped — real reversal
            logger.warning(
                "Structural flip + premium flip → EXIT T1, TIGHTEN TRAIL"
            )
            return {
                "flip": True,
                "action": "EXIT_T1_TIGHTEN",
                "reason": "Both OI and premium confirm flip = real reversal"
            }

        return {"flip": True, "action": "HOLD", "reason": "Ambiguous"}