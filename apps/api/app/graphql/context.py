"""GraphQL context — injected into every resolver via strawberry.Info.

Carries the authenticated tenant_id and a SQLAlchemy session so resolvers
don't need FastAPI dependencies directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass
class GraphQLContext:
    """Per-request context passed to all resolvers and dataloaders."""

    tenant_id: str
    db: "Session"
    # Lazily populated dataloader instances (one per request)
    _loaders: dict[str, Any] = field(default_factory=dict)

    def get_loader(self, name: str, factory):  # type: ignore[no-untyped-def]
        """Return a cached dataloader for this request, creating it if needed."""
        if name not in self._loaders:
            self._loaders[name] = factory(self.db, self.tenant_id)
        return self._loaders[name]
