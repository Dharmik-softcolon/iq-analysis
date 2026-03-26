from datetime import datetime, time
import pytz

IST = pytz.timezone("Asia/Kolkata")

def now_ist() -> datetime:
    return datetime.now(IST)

def time_ist() -> time:
    return now_ist().time()

def is_between(start_str: str, end_str: str) -> bool:
    now = time_ist()
    start = datetime.strptime(start_str, "%H:%M").time()
    end = datetime.strptime(end_str, "%H:%M").time()
    return start <= now <= end

def is_after(time_str: str) -> bool:
    now = time_ist()
    t = datetime.strptime(time_str, "%H:%M").time()
    return now >= t

def is_before(time_str: str) -> bool:
    now = time_ist()
    t = datetime.strptime(time_str, "%H:%M").time()
    return now < t

def is_ib_window() -> bool:
    return is_between("09:30", "09:45")

def is_post_ib_window() -> bool:
    return is_between("09:45", "10:30")

def is_late_entry_window() -> bool:
    return is_between("10:30", "12:00")

def get_weekday() -> int:
    return now_ist().weekday()  # 0=Mon, 4=Fri

def is_expiry_day(expiry_date: str) -> bool:
    today = now_ist().strftime("%Y-%m-%d")
    return today == expiry_date