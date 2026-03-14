"""
Conftest for eval suite — no DB needed (all tools run with in-memory or no-op DB).
"""
# No fixtures required here — the eval suite uses tools directly without DB session.
# DB-dependent scenarios are skipped gracefully via tool-level session isolation.
