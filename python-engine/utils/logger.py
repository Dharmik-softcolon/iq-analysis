import logging
import sys
from datetime import datetime
from pathlib import Path

def setup_logger(name: str) -> logging.Logger:
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

    class SpamFilter(logging.Filter):
        def filter(self, record):
            msg = record.getMessage()
            unwanted = [
                "Outside market hours — sleeping",
                "No market data — skipping tick",
                "System SHUTDOWN — no trading",
                "TICK:",
                "DTE:",
                "Stay flat condition — no trading",
                "BALANCE + IAE < 6 — standby",
                "No direction confirmed — no trade",
                "reached — standby",
                "In position (",
                "Fetching NFO instruments",
                "Starting market data computation",
                "Waiting 10s for initial",
                "Waiting 60s for capital",
                "Fetching real trading capital"
            ]
            return not any(u in msg for u in unwanted)

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.addFilter(SpamFilter())
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    ))

    # File handler
    today = datetime.now().strftime("%Y-%m-%d")
    file_handler = logging.FileHandler(f"logs/whalehq_{today}.log")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    ))

    logger.addHandler(console)
    logger.addHandler(file_handler)

    return logger