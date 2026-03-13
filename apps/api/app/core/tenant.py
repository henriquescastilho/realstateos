from dataclasses import dataclass


@dataclass(slots=True)
class RequestContext:
    user_id: str
    tenant_id: str
    role: str

