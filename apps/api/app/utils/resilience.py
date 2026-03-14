"""Retry and circuit breaker utilities for external API calls.

Usage:

    @retry_with_backoff(max_attempts=3, base_delay=1.0)
    def call_external_api():
        ...

    breaker = CircuitBreaker(name="santander", failure_threshold=5)

    @breaker
    def call_santander():
        ...
"""
from __future__ import annotations

import functools
import logging
import time
from enum import Enum
from threading import Lock
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable)


# ---------------------------------------------------------------------------
# Retry with exponential backoff
# ---------------------------------------------------------------------------

def retry_with_backoff(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    backoff_factor: float = 2.0,
    exceptions: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[F], F]:
    """Decorator: retry *func* up to *max_attempts* times with exponential backoff.

    Args:
        max_attempts: Total number of attempts (including the first).
        base_delay: Initial wait in seconds before the second attempt.
        max_delay: Cap on the wait time.
        backoff_factor: Multiplier applied to delay after each failure.
        exceptions: Only retry on these exception types.
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = base_delay
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt == max_attempts:
                        break
                    logger.warning(
                        "Attempt %d/%d failed for %s — retrying in %.1fs: %s",
                        attempt,
                        max_attempts,
                        func.__qualname__,
                        delay,
                        exc,
                    )
                    time.sleep(delay)
                    delay = min(delay * backoff_factor, max_delay)
            logger.error("All %d attempts failed for %s: %s", max_attempts, func.__qualname__, last_exc)
            raise last_exc  # type: ignore[misc]

        return wrapper  # type: ignore[return-value]

    return decorator


# ---------------------------------------------------------------------------
# Circuit Breaker
# ---------------------------------------------------------------------------

class CircuitState(Enum):
    CLOSED = "closed"       # Normal operation — requests pass through
    OPEN = "open"           # Failing — requests rejected immediately
    HALF_OPEN = "half_open" # Probing — one request allowed through


class CircuitBreakerOpen(Exception):
    """Raised when a call is rejected because the circuit is OPEN."""

    def __init__(self, name: str) -> None:
        super().__init__(f"Circuit breaker '{name}' is OPEN — call rejected")
        self.circuit_name = name


class CircuitBreaker:
    """Thread-safe circuit breaker with open/half-open/closed states.

    State transitions:
        CLOSED  → OPEN:      failure_threshold consecutive failures
        OPEN    → HALF_OPEN: after recovery_timeout seconds
        HALF_OPEN → CLOSED:  probe request succeeds
        HALF_OPEN → OPEN:    probe request fails

    Usage as a decorator:

        breaker = CircuitBreaker("santander", failure_threshold=5, recovery_timeout=60)

        @breaker
        def call_santander():
            ...

    Or as a context manager:

        with breaker:
            call_santander()
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: float = 0.0
        self._lock = Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    def _transition(self, new_state: CircuitState) -> None:
        logger.info("CircuitBreaker '%s': %s → %s", self.name, self._state.value, new_state.value)
        self._state = new_state

    def _check_state(self) -> None:
        """Raise CircuitBreakerOpen if the circuit should block this call."""
        with self._lock:
            if self._state == CircuitState.OPEN:
                elapsed = time.monotonic() - self._last_failure_time
                if elapsed >= self.recovery_timeout:
                    self._transition(CircuitState.HALF_OPEN)
                else:
                    raise CircuitBreakerOpen(self.name)
            # CLOSED or HALF_OPEN: allow through

    def _on_success(self) -> None:
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._transition(CircuitState.CLOSED)
            self._failure_count = 0

    def _on_failure(self, exc: Exception) -> None:
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.monotonic()
            logger.warning(
                "CircuitBreaker '%s' failure %d/%d: %s",
                self.name,
                self._failure_count,
                self.failure_threshold,
                exc,
            )
            if self._state == CircuitState.HALF_OPEN or self._failure_count >= self.failure_threshold:
                self._transition(CircuitState.OPEN)

    def __call__(self, func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            self._check_state()
            try:
                result = func(*args, **kwargs)
                self._on_success()
                return result
            except CircuitBreakerOpen:
                raise
            except Exception as exc:
                self._on_failure(exc)
                raise

        return wrapper  # type: ignore[return-value]

    def __enter__(self) -> "CircuitBreaker":
        self._check_state()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if exc_type is None:
            self._on_success()
        elif exc_type is not CircuitBreakerOpen:
            self._on_failure(exc_val)
        return False  # Do not suppress exceptions


# ---------------------------------------------------------------------------
# Pre-configured breakers for external services
# ---------------------------------------------------------------------------

santander_breaker = CircuitBreaker("santander", failure_threshold=5, recovery_timeout=60.0)
whatsapp_breaker = CircuitBreaker("whatsapp", failure_threshold=5, recovery_timeout=30.0)
email_breaker = CircuitBreaker("email", failure_threshold=5, recovery_timeout=30.0)
ocr_breaker = CircuitBreaker("ocr", failure_threshold=3, recovery_timeout=120.0)
