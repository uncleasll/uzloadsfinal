"""
Company (tenant) scoping in one place.

The request middleware stores the current company id in a context variable. Two SQLAlchemy hooks
then make every session tenant-aware without touching each query:

  - every SELECT on a model that has a `company_id` column gets `company_id = <current>` added
  - every new object with an empty `company_id` is stamped with the current company on flush

When no company is set (scripts, tests that do not care, unauthenticated local dev) nothing is
filtered, which keeps the old single-company behaviour.
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from app.db.session import Base

_current_company: ContextVar[int | None] = ContextVar("current_company", default=None)


def get_company_id() -> int | None:
    return _current_company.get()


def set_company_id(company_id: int | None):
    """Returns a token for reset(); use `company_scope` where possible."""
    return _current_company.set(company_id)


def reset_company_id(token) -> None:
    _current_company.reset(token)


@contextmanager
def company_scope(company_id: int | None):
    token = _current_company.set(company_id)
    try:
        yield
    finally:
        _current_company.reset(token)


def scoped_models() -> list[type]:
    return [m.class_ for m in Base.registry.mappers if "company_id" in m.columns]


@event.listens_for(Session, "do_orm_execute")
def _filter_by_company(state):
    cid = _current_company.get()
    if cid is None or not state.is_select or state.execution_options.get("skip_tenant"):
        return
    for cls in scoped_models():
        # cid is a closure variable on purpose: SQLAlchemy tracks it in the statement cache key,
        # so company A's compiled filter is never reused for company B.
        state.statement = state.statement.options(
            with_loader_criteria(cls, lambda c: c.company_id == cid, include_aliases=True, track_closure_variables=True)
        )


@event.listens_for(Session, "before_flush")
def _stamp_company(session, flush_context, instances):
    cid = _current_company.get()
    if cid is None:
        return
    for obj in session.new:
        if hasattr(obj, "company_id") and getattr(obj, "company_id") is None:
            obj.company_id = cid
