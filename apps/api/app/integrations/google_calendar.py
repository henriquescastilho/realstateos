"""Google Calendar integration.

Handles:
- Creating calendar events for:
    - Contract renewal reminders (60 days before expiry)
    - Property inspection dates
    - Maintenance appointments
- OAuth2 per-organization: each tenant stores their own credentials.
- Bidirectional sync: list and delete events created by this integration.
- Graceful fallback: returns stub events when google-api-python-client not installed.

OAuth2 flow (per-org):
    1. GET /calendar/auth?org_id=<uuid>          → redirect to Google consent page
    2. GET /calendar/callback?code=<code>&state=<org_id>  → exchange code, store tokens
    3. Tokens stored in DB (or env-var for single-org setups)

Environment variables (single-org / dev mode):
    GOOGLE_CALENDAR_CLIENT_ID
    GOOGLE_CALENDAR_CLIENT_SECRET
    GOOGLE_CALENDAR_REDIRECT_URI
    GOOGLE_CALENDAR_ID      (default: "primary")

Usage:
    client = CalendarClient.from_env()

    # Contract renewal reminder
    event = client.create_renewal_reminder(
        contract_id="abc-123",
        contract_code="CONT-2024-001",
        property_address="Rua das Flores, 100 — São Paulo",
        renter_name="João Silva",
        owner_email="owner@example.com",
        renewal_date=date(2026, 6, 30),
    )

    # Maintenance appointment
    event = client.create_maintenance_appointment(
        ticket_id="TKT-456",
        property_address="Av. Paulista, 200",
        description="Reparo de encanamento",
        technician_name="Carlos Técnico",
        start_datetime=datetime(2026, 4, 10, 9, 0),
        duration_minutes=120,
        attendee_emails=["renter@example.com", "owner@example.com"],
    )
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependencies
# ---------------------------------------------------------------------------

try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build as _gcal_build
    from googleapiclient.errors import HttpError as _GCalHttpError
    _HAS_GCAL = True
except ImportError:
    _HAS_GCAL = False
    logger.warning(
        "google-api-python-client / google-auth-oauthlib not installed — "
        "CalendarClient running in stub mode. "
        "pip install google-api-python-client google-auth-oauthlib"
    )

try:
    from app.utils.resilience import retry_with_backoff, CircuitBreaker
except ImportError:
    def retry_with_backoff(**kwargs):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator

    class CircuitBreaker:  # type: ignore[no-redef]
        def __init__(self, *args, **kwargs): ...
        def __call__(self, fn):
            return fn


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
RENEWAL_REMINDER_DAYS_BEFORE = 60
EVENT_COLOR_RENEWAL = "5"       # banana (yellow)
EVENT_COLOR_INSPECTION = "2"    # sage (green)
EVENT_COLOR_MAINTENANCE = "6"   # tangerine (orange)

# Event source tag — used to identify events created by this integration
EVENT_SOURCE_LABEL = "realstateos"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CalendarEvent:
    """A created or fetched Google Calendar event."""

    event_id: str
    calendar_id: str
    summary: str
    start: datetime
    end: datetime
    html_link: str = ""
    description: str = ""
    attendees: list[str] = field(default_factory=list)
    sandbox: bool = False


@dataclass
class OAuthTokens:
    """Google OAuth2 tokens for one organization."""

    access_token: str
    refresh_token: str
    token_uri: str = "https://oauth2.googleapis.com/token"
    client_id: str = ""
    client_secret: str = ""
    scopes: list[str] = field(default_factory=lambda: list(CALENDAR_SCOPES))
    expiry: datetime | None = None

    def to_dict(self) -> dict:
        return {
            "token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_uri": self.token_uri,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scopes": self.scopes,
        }


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class CalendarAuthError(RuntimeError):
    """Raised when OAuth2 credentials are missing or invalid."""


class CalendarAPIError(RuntimeError):
    """Raised when the Google Calendar API returns an error."""


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

_api_breaker = CircuitBreaker(
    name="google_calendar",
    failure_threshold=5,
    recovery_timeout=120,
)


# ---------------------------------------------------------------------------
# CalendarClient
# ---------------------------------------------------------------------------

class CalendarClient:
    """Google Calendar client with per-org OAuth2.

    Thread-safe. Falls back to stub events when google libraries are missing.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        calendar_id: str = "primary",
        tokens: OAuthTokens | None = None,
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.calendar_id = calendar_id
        self._tokens = tokens
        self._service: Any = None
        self._service_lock = Lock()

        stub = not _HAS_GCAL or not tokens
        logger.info(
            "CalendarClient initialised (calendar_id=%s, stub=%s)",
            self.calendar_id, stub,
        )

    @classmethod
    def from_env(cls) -> "CalendarClient":
        """Construct from environment variables (single-org / dev mode).

        Required (for real API calls):
            GOOGLE_CALENDAR_CLIENT_ID
            GOOGLE_CALENDAR_CLIENT_SECRET
            GOOGLE_CALENDAR_REDIRECT_URI

        Optional:
            GOOGLE_CALENDAR_ACCESS_TOKEN    Pre-authorised access token
            GOOGLE_CALENDAR_REFRESH_TOKEN   Refresh token for auto-renewal
            GOOGLE_CALENDAR_ID              Default calendar (default: primary)
        """
        client_id = os.environ.get("GOOGLE_CALENDAR_CLIENT_ID", "")
        client_secret = os.environ.get("GOOGLE_CALENDAR_CLIENT_SECRET", "")
        redirect_uri = os.environ.get("GOOGLE_CALENDAR_REDIRECT_URI", "http://localhost:8000/calendar/callback")
        calendar_id = os.environ.get("GOOGLE_CALENDAR_ID", "primary")

        tokens: OAuthTokens | None = None
        access_token = os.environ.get("GOOGLE_CALENDAR_ACCESS_TOKEN", "")
        refresh_token = os.environ.get("GOOGLE_CALENDAR_REFRESH_TOKEN", "")
        if access_token and refresh_token:
            tokens = OAuthTokens(
                access_token=access_token,
                refresh_token=refresh_token,
                client_id=client_id,
                client_secret=client_secret,
            )

        return cls(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            calendar_id=calendar_id,
            tokens=tokens,
        )

    @classmethod
    def from_tokens(
        cls,
        tokens: OAuthTokens,
        client_id: str = "",
        client_secret: str = "",
        redirect_uri: str = "",
        calendar_id: str = "primary",
    ) -> "CalendarClient":
        """Construct with pre-loaded OAuth2 tokens (multi-org use case)."""
        return cls(
            client_id=client_id or tokens.client_id,
            client_secret=client_secret or tokens.client_secret,
            redirect_uri=redirect_uri,
            calendar_id=calendar_id,
            tokens=tokens,
        )

    # ------------------------------------------------------------------
    # OAuth2 flow helpers
    # ------------------------------------------------------------------

    def get_auth_url(self, state: str = "") -> str:
        """Return the Google OAuth2 consent page URL.

        Args:
            state: Opaque state string (e.g. org_id) returned in callback.

        Returns:
            URL to redirect the user to.
        """
        if not _HAS_GCAL:
            return f"https://stub-oauth.example.com/auth?state={state}"

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uris": [self.redirect_uri],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=CALENDAR_SCOPES,
        )
        flow.redirect_uri = self.redirect_uri
        url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        return url

    def exchange_code(self, code: str) -> OAuthTokens:
        """Exchange an authorisation code for tokens.

        Call this from your OAuth2 callback endpoint.
        Store the returned OAuthTokens per org in your database.
        """
        if not _HAS_GCAL:
            return OAuthTokens(
                access_token="stub-access-token",
                refresh_token="stub-refresh-token",
                client_id=self.client_id,
                client_secret=self.client_secret,
            )

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uris": [self.redirect_uri],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=CALENDAR_SCOPES,
        )
        flow.redirect_uri = self.redirect_uri
        flow.fetch_token(code=code)
        creds = flow.credentials
        return OAuthTokens(
            access_token=creds.token,
            refresh_token=creds.refresh_token or "",
            client_id=self.client_id,
            client_secret=self.client_secret,
            scopes=list(creds.scopes or CALENDAR_SCOPES),
            expiry=creds.expiry,
        )

    # ------------------------------------------------------------------
    # Domain event creators
    # ------------------------------------------------------------------

    def create_renewal_reminder(
        self,
        contract_id: str,
        contract_code: str,
        property_address: str,
        renter_name: str,
        renewal_date: date,
        owner_email: str = "",
        renter_email: str = "",
    ) -> CalendarEvent:
        """Create a renewal reminder event 60 days before contract expiry.

        Args:
            contract_id: Internal contract UUID (stored in event description).
            contract_code: Human-readable contract code (e.g. CONT-2024-001).
            property_address: Property address for display.
            renter_name: Renter's full name.
            renewal_date: Contract expiry / renewal date.
            owner_email: Optional owner email to invite.
            renter_email: Optional renter email to invite.

        Returns:
            CalendarEvent with event_id for future reference.
        """
        reminder_date = renewal_date - timedelta(days=RENEWAL_REMINDER_DAYS_BEFORE)
        start_dt = datetime(reminder_date.year, reminder_date.month, reminder_date.day, 9, 0)
        end_dt = start_dt + timedelta(hours=1)

        summary = f"Renovação Contrato — {contract_code} ({renter_name})"
        description = (
            f"Contrato {contract_code} vence em {renewal_date.strftime('%d/%m/%Y')}.\n"
            f"Imóvel: {property_address}\n"
            f"Locatário: {renter_name}\n"
            f"ID interno: {contract_id}\n"
            f"Fonte: {EVENT_SOURCE_LABEL}"
        )

        attendees = [e for e in [owner_email, renter_email] if e]
        return self._create_event(
            summary=summary,
            description=description,
            start=start_dt,
            end=end_dt,
            attendees=attendees,
            color_id=EVENT_COLOR_RENEWAL,
            reminders_minutes=[1440, 60],  # 1 day + 1 hour before
        )

    def create_inspection_event(
        self,
        property_address: str,
        inspection_date: date,
        inspector_name: str = "",
        owner_email: str = "",
        renter_email: str = "",
        notes: str = "",
    ) -> CalendarEvent:
        """Create a property inspection event on the given date."""
        start_dt = datetime(inspection_date.year, inspection_date.month, inspection_date.day, 10, 0)
        end_dt = start_dt + timedelta(hours=2)

        summary = f"Vistoria — {property_address}"
        lines = [f"Imóvel: {property_address}"]
        if inspector_name:
            lines.append(f"Vistoriador: {inspector_name}")
        if notes:
            lines.append(f"Observações: {notes}")
        lines.append(f"Fonte: {EVENT_SOURCE_LABEL}")
        description = "\n".join(lines)

        attendees = [e for e in [owner_email, renter_email] if e]
        return self._create_event(
            summary=summary,
            description=description,
            start=start_dt,
            end=end_dt,
            attendees=attendees,
            color_id=EVENT_COLOR_INSPECTION,
            reminders_minutes=[1440, 120],
        )

    def create_maintenance_appointment(
        self,
        ticket_id: str,
        property_address: str,
        description: str,
        technician_name: str = "",
        start_datetime: datetime | None = None,
        duration_minutes: int = 60,
        attendee_emails: list[str] | None = None,
    ) -> CalendarEvent:
        """Create a maintenance appointment event."""
        if start_datetime is None:
            # Default: next business day at 09:00
            tomorrow = datetime.utcnow().date() + timedelta(days=1)
            start_datetime = datetime(tomorrow.year, tomorrow.month, tomorrow.day, 9, 0)

        end_datetime = start_datetime + timedelta(minutes=duration_minutes)

        summary = f"Manutenção #{ticket_id} — {property_address}"
        desc_lines = [
            f"Chamado: #{ticket_id}",
            f"Imóvel: {property_address}",
            f"Serviço: {description}",
        ]
        if technician_name:
            desc_lines.append(f"Técnico: {technician_name}")
        desc_lines.append(f"Fonte: {EVENT_SOURCE_LABEL}")

        return self._create_event(
            summary=summary,
            description="\n".join(desc_lines),
            start=start_datetime,
            end=end_datetime,
            attendees=attendee_emails or [],
            color_id=EVENT_COLOR_MAINTENANCE,
            reminders_minutes=[1440, 60],
        )

    # ------------------------------------------------------------------
    # List / delete events (bidirectional sync)
    # ------------------------------------------------------------------

    def list_events(
        self,
        time_min: datetime | None = None,
        time_max: datetime | None = None,
        max_results: int = 100,
    ) -> list[CalendarEvent]:
        """List events created by this integration.

        Filters by the EVENT_SOURCE_LABEL tag in the description.
        """
        if not _HAS_GCAL or not self._tokens:
            logger.info("calendar.list_events.stub")
            return []

        service = self._get_service()
        if service is None:
            return []

        params: dict[str, Any] = {
            "calendarId": self.calendar_id,
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
            "q": EVENT_SOURCE_LABEL,  # text search in description
        }
        if time_min:
            params["timeMin"] = time_min.isoformat() + "Z"
        if time_max:
            params["timeMax"] = time_max.isoformat() + "Z"

        try:
            result = service.events().list(**params).execute()
            return [_map_gcal_event(e, self.calendar_id) for e in result.get("items", [])]
        except Exception as exc:
            logger.error("calendar.list_events error: %s", exc)
            return []

    def delete_event(self, event_id: str) -> bool:
        """Delete a specific event by ID. Returns True on success."""
        if not _HAS_GCAL or not self._tokens:
            logger.info("calendar.delete_event.stub event_id=%s", event_id)
            return True

        service = self._get_service()
        if service is None:
            return False

        try:
            service.events().delete(
                calendarId=self.calendar_id,
                eventId=event_id,
            ).execute()
            logger.info("calendar.event_deleted event_id=%s", event_id)
            return True
        except Exception as exc:
            logger.error("calendar.delete_event error event_id=%s: %s", event_id, exc)
            return False

    def get_event(self, event_id: str) -> CalendarEvent | None:
        """Fetch a single event by ID."""
        if not _HAS_GCAL or not self._tokens:
            return None

        service = self._get_service()
        if service is None:
            return None

        try:
            item = service.events().get(
                calendarId=self.calendar_id,
                eventId=event_id,
            ).execute()
            return _map_gcal_event(item, self.calendar_id)
        except Exception as exc:
            logger.error("calendar.get_event error event_id=%s: %s", event_id, exc)
            return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @_api_breaker
    @retry_with_backoff(max_attempts=3, base_delay=2.0, exceptions=(CalendarAPIError,))
    def _create_event(
        self,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        attendees: list[str],
        color_id: str = "1",
        reminders_minutes: list[int] | None = None,
    ) -> CalendarEvent:
        """Build and submit a Google Calendar event object."""
        if not _HAS_GCAL or not self._tokens:
            stub_id = f"stub_{int(start.timestamp())}"
            logger.info(
                "calendar.create_event.stub summary=%r start=%s",
                summary, start.isoformat(),
            )
            return CalendarEvent(
                event_id=stub_id,
                calendar_id=self.calendar_id,
                summary=summary,
                start=start,
                end=end,
                description=description,
                attendees=attendees,
                sandbox=True,
            )

        service = self._get_service()
        if service is None:
            raise CalendarAuthError("Google Calendar service unavailable — check OAuth2 tokens")

        body: dict[str, Any] = {
            "summary": summary,
            "description": description,
            "colorId": color_id,
            "start": {"dateTime": start.isoformat(), "timeZone": "America/Sao_Paulo"},
            "end": {"dateTime": end.isoformat(), "timeZone": "America/Sao_Paulo"},
            "source": {
                "title": "Real Estate OS",
                "url": "https://app.realstateos.com",
            },
        }

        if attendees:
            body["attendees"] = [{"email": e} for e in attendees]

        if reminders_minutes:
            body["reminders"] = {
                "useDefault": False,
                "overrides": [
                    {"method": "email", "minutes": m}
                    for m in reminders_minutes
                ],
            }

        try:
            result = service.events().insert(
                calendarId=self.calendar_id,
                body=body,
                sendUpdates="all" if attendees else "none",
            ).execute()
        except _GCalHttpError as exc:
            raise CalendarAPIError(
                f"Google Calendar API error ({exc.status_code}): {exc.reason}"
            ) from exc

        event = _map_gcal_event(result, self.calendar_id)
        logger.info(
            "calendar.event_created event_id=%s summary=%r",
            event.event_id, summary,
        )
        return event

    def _get_service(self) -> Any:
        """Return an authenticated Google Calendar service object (cached)."""
        with self._service_lock:
            if self._service is not None:
                return self._service

            if not _HAS_GCAL or not self._tokens:
                return None

            try:
                creds = Credentials(
                    token=self._tokens.access_token,
                    refresh_token=self._tokens.refresh_token,
                    token_uri=self._tokens.token_uri,
                    client_id=self._tokens.client_id or self.client_id,
                    client_secret=self._tokens.client_secret or self.client_secret,
                    scopes=self._tokens.scopes,
                )

                # Refresh token if expired
                if creds.expired and creds.refresh_token:
                    creds.refresh(GoogleRequest())
                    # Update stored tokens
                    self._tokens = OAuthTokens(
                        access_token=creds.token,
                        refresh_token=creds.refresh_token or self._tokens.refresh_token,
                        client_id=self.client_id,
                        client_secret=self.client_secret,
                        scopes=list(creds.scopes or CALENDAR_SCOPES),
                        expiry=creds.expiry,
                    )
                    logger.info("calendar.token_refreshed")

                self._service = _gcal_build(
                    "calendar", "v3",
                    credentials=creds,
                    cache_discovery=False,
                )
                return self._service

            except Exception as exc:
                logger.error("calendar.service_build_failed: %s", exc)
                return None

    def invalidate_service(self) -> None:
        """Force re-build of service on next call (e.g. after token update)."""
        with self._service_lock:
            self._service = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _map_gcal_event(item: dict, calendar_id: str) -> CalendarEvent:
    """Map a raw Google Calendar event dict to CalendarEvent."""
    start_raw = item.get("start", {})
    end_raw = item.get("end", {})

    def _parse_dt(raw: dict) -> datetime:
        dt_str = raw.get("dateTime") or raw.get("date", "")
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return datetime.utcnow()

    attendees = [
        a["email"] for a in item.get("attendees", []) if "email" in a
    ]

    return CalendarEvent(
        event_id=item.get("id", ""),
        calendar_id=calendar_id,
        summary=item.get("summary", ""),
        start=_parse_dt(start_raw),
        end=_parse_dt(end_raw),
        html_link=item.get("htmlLink", ""),
        description=item.get("description", ""),
        attendees=attendees,
        sandbox=False,
    )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_default_client: CalendarClient | None = None
_singleton_lock = Lock()


def get_calendar_client() -> CalendarClient:
    """Return module-level CalendarClient singleton (single-org / dev mode)."""
    global _default_client
    if _default_client is None:
        with _singleton_lock:
            if _default_client is None:
                _default_client = CalendarClient.from_env()
    return _default_client
