import math
import os
import threading
import time
from collections.abc import Callable


def _read_positive_integer(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value == "":
        return default

    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be a positive integer") from error

    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


class FixedWindowRateLimiter:
    def __init__(
        self,
        max_requests: int,
        window_seconds: int,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if max_requests <= 0:
            raise ValueError("max_requests must be a positive integer")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be a positive integer")

        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clock = clock
        self._buckets: dict[str, tuple[int, int]] = {}
        self._requests_since_cleanup = 0
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, dict[str, str]]:
        now = self._clock()
        window_start = int(now // self.window_seconds) * self.window_seconds
        reset_at = window_start + self.window_seconds

        with self._lock:
            stored = self._buckets.get(key)
            count = stored[1] if stored and stored[0] == window_start else 0
            count += 1
            self._buckets[key] = (window_start, count)

            if count > self.max_requests:
                self._requests_since_cleanup += 1
                if self._requests_since_cleanup >= 256:
                    self._remove_expired_windows(window_start)

                retry_after = max(1, math.ceil(reset_at - now))
                return False, {
                    "RateLimit-Limit": str(self.max_requests),
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(retry_after),
                    "RateLimit-Policy": (
                        f"{self.max_requests};w={self.window_seconds}"
                    ),
                    "Retry-After": str(retry_after),
                }

            self._requests_since_cleanup += 1
            if self._requests_since_cleanup >= 256:
                self._remove_expired_windows(window_start)

            remaining = max(0, self.max_requests - count)
            return True, {
                "RateLimit-Limit": str(self.max_requests),
                "RateLimit-Remaining": str(remaining),
                "RateLimit-Reset": str(max(0, math.ceil(reset_at - now))),
                "RateLimit-Policy": (
                    f"{self.max_requests};w={self.window_seconds}"
                ),
            }

    def _remove_expired_windows(self, current_window_start: int) -> None:
        expired = [
            key
            for key, (window_start, _count) in self._buckets.items()
            if window_start < current_window_start
        ]
        for key in expired:
            del self._buckets[key]
        self._requests_since_cleanup = 0

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._requests_since_cleanup = 0


RATE_LIMIT_MAX_REQUESTS = _read_positive_integer(
    "API_RATE_LIMIT_MAX_REQUESTS", 100
)
RATE_LIMIT_WINDOW_SECONDS = _read_positive_integer(
    "API_RATE_LIMIT_WINDOW_SECONDS", 900
)

