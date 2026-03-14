"""Reusable Pydantic field validators for Brazilian document formats.

All validators are annotated types usable with Pydantic v2 `Annotated` syntax.
"""
from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator


# ---------------------------------------------------------------------------
# CPF / CNPJ
# ---------------------------------------------------------------------------

def _strip_cpf_cnpj(v: str) -> str:
    return re.sub(r"\D", "", v)


def _validate_cpf_digits(digits: str) -> bool:
    """Validate CPF check digits (11 digits)."""
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    for pos in range(9, 11):
        total = sum(int(d) * (pos + 1 - i) for i, d in enumerate(digits[:pos]))
        check = (total * 10 % 11) % 10
        if check != int(digits[pos]):
            return False
    return True


def _validate_cnpj_digits(digits: str) -> bool:
    """Validate CNPJ check digits (14 digits)."""
    if len(digits) != 14 or digits == digits[0] * 14:
        return False
    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights2 = [6] + weights1
    for weights, pos in [(weights1, 12), (weights2, 13)]:
        total = sum(int(d) * w for d, w in zip(digits[:pos], weights))
        check = 11 - (total % 11)
        if check >= 10:
            check = 0
        if check != int(digits[pos]):
            return False
    return True


def _validate_document(v: str) -> str:
    """Validate CPF (11 digits) or CNPJ (14 digits)."""
    digits = _strip_cpf_cnpj(v)
    if len(digits) == 11:
        if not _validate_cpf_digits(digits):
            raise ValueError(f"CPF inválido: {v!r}")
        return digits
    if len(digits) == 14:
        if not _validate_cnpj_digits(digits):
            raise ValueError(f"CNPJ inválido: {v!r}")
        return digits
    raise ValueError(f"Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ): {v!r}")


BRDocument = Annotated[str, AfterValidator(_validate_document)]


# ---------------------------------------------------------------------------
# Phone (Brazilian — 10 or 11 digits)
# ---------------------------------------------------------------------------

_PHONE_RE = re.compile(r"^\+?[\d\s\-().]{8,20}$")


def _validate_phone(v: str) -> str:
    digits = re.sub(r"\D", "", v)
    if len(digits) < 10 or len(digits) > 13:
        raise ValueError(f"Telefone inválido: {v!r}. Use formato com DDD, ex: (11) 99999-9999")
    return v.strip()


BRPhone = Annotated[str, AfterValidator(_validate_phone)]


# ---------------------------------------------------------------------------
# CEP (Brazilian postal code — 8 digits)
# ---------------------------------------------------------------------------

def _validate_cep(v: str) -> str:
    digits = re.sub(r"\D", "", v)
    if len(digits) != 8:
        raise ValueError(f"CEP inválido: {v!r}. Use formato 00000-000")
    return f"{digits[:5]}-{digits[5:]}"


BRCEP = Annotated[str, AfterValidator(_validate_cep)]


# ---------------------------------------------------------------------------
# Safe string (prevents basic injection attacks)
# ---------------------------------------------------------------------------

_INJECTION_RE = re.compile(r"[<>\"';\\]|--|\b(DROP|SELECT|INSERT|UPDATE|DELETE|EXEC)\b", re.IGNORECASE)


def _sanitize_string(v: str) -> str:
    if _INJECTION_RE.search(v):
        raise ValueError("Input contains potentially unsafe characters or SQL keywords")
    return v.strip()


SafeStr = Annotated[str, AfterValidator(_sanitize_string)]
