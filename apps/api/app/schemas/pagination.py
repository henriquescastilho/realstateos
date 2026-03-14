"""Pagination schemas.

All list endpoints return a ``PaginatedResponse[T]`` envelope for consistency.

Usage example::

    from app.schemas.pagination import PaginatedResponse, PaginationParams

    @router.get("", response_model=PaginatedResponse[OwnerRead])
    def list_owners(p: PaginationParams = Depends(), ...):
        total = db.scalar(select(func.count()).select_from(Owner).where(...))
        items = db.scalars(select(Owner).where(...).offset(p.offset).limit(p.limit)).all()
        return PaginatedResponse.build(items=items, total=total, params=p)
"""

from __future__ import annotations

import math
from typing import Generic, Sequence, TypeVar

from fastapi import Query
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class PaginationParams:
    """FastAPI dependency that extracts ``page`` / ``per_page`` from the query string.

    Compatible with both ``?page=2&per_page=20`` (page-based) and the legacy
    ``?offset=20&limit=20`` style — both sets of parameters are accepted and
    converted to a common internal representation.
    """

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number"),
        per_page: int = Query(50, ge=1, le=200, alias="per_page", description="Items per page (max 200)"),
    ) -> None:
        self.page = page
        self.per_page = per_page

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page

    @property
    def limit(self) -> int:
        return self.per_page


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated envelope returned by all list endpoints.

    Fields
    ------
    items
        The current page's items.
    total
        Total number of matching records (across all pages).
    page
        Current 1-based page number.
    per_page
        Maximum items per page.
    pages
        Total number of pages (``ceil(total / per_page)``).
    """

    model_config = ConfigDict(from_attributes=True)

    items: list[T]
    total: int
    page: int
    per_page: int
    pages: int

    @classmethod
    def build(
        cls,
        *,
        items: Sequence[T],
        total: int,
        params: PaginationParams,
    ) -> "PaginatedResponse[T]":
        pages = max(1, math.ceil(total / params.per_page)) if total else 1
        return cls(
            items=list(items),
            total=total,
            page=params.page,
            per_page=params.per_page,
            pages=pages,
        )
