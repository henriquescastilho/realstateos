"""Document comparison agent — LlmAgent that compares two contract versions
and highlights changes in plain Portuguese.

Tools:
    extract_contract_clauses(pdf_path) -> list of clause dicts
    diff_clauses(v1, v2)               -> list of diff dicts (added/removed/changed)
    summarize_changes(diff)            -> plain Portuguese summary

Non-ADK fallback: direct text-diff with heuristic clause extraction.
"""
from __future__ import annotations

import difflib
import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

try:
    from google.adk.agents import LlmAgent  # type: ignore
    _ADK_AVAILABLE = True
except ModuleNotFoundError:  # pragma: no cover
    LlmAgent = None  # type: ignore[assignment,misc]
    _ADK_AVAILABLE = False

from app.config import settings

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Clause:
    index: int
    title: str
    text: str


@dataclass
class ClauseDiff:
    change_type: str     # "added" | "removed" | "changed" | "unchanged"
    clause_index: int
    title: str
    old_text: str = ""
    new_text: str = ""
    diff_lines: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Tool: extract_contract_clauses
# ---------------------------------------------------------------------------

def extract_contract_clauses(pdf_path: str) -> list[dict]:
    """
    Extract numbered/titled clauses from a contract PDF.

    Uses pdfplumber when available; falls back to raw text with regex.
    Returns a list of clause dicts: {index, title, text}.
    """
    text = _extract_text(pdf_path)
    if not text:
        return []
    clauses = _parse_clauses(text)
    return [{"index": c.index, "title": c.title, "text": c.text} for c in clauses]


def _extract_text(pdf_path: str) -> str:
    """Extract raw text from PDF. Falls back to reading as plain text."""
    try:
        import pdfplumber  # type: ignore
        with pdfplumber.open(pdf_path) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("document_agent: pdfplumber failed for %s: %s", pdf_path, exc)

    # Try PyPDF2
    try:
        import PyPDF2  # type: ignore
        with open(pdf_path, "rb") as fh:
            reader = PyPDF2.PdfReader(fh)
            return "\n".join(
                page.extract_text() or "" for page in reader.pages
            )
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("document_agent: PyPDF2 failed for %s: %s", pdf_path, exc)

    # Last resort: read as plain text (for text-based contracts)
    try:
        with open(pdf_path, encoding="utf-8", errors="ignore") as fh:
            return fh.read()
    except Exception as exc:
        logger.warning("document_agent: text read failed for %s: %s", pdf_path, exc)

    return ""


# Patterns for clause headings in Brazilian contracts
_CLAUSE_PATTERNS = [
    re.compile(r"^(CLÁUSULA\s+\w+[^:]*?)[:\-–]?\s*\n", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^(\d+[\.\)]\s+[A-ZÁÊÇÃÉÔÓÚÀÜ][^:\n]{0,80})[:\-–]?\s*\n", re.MULTILINE),
    re.compile(r"^([IVXLC]+[\.\)]\s+[A-ZÁÊÇÃÉÔÓÚÀÜ][^:\n]{0,80})[:\-–]?\s*\n", re.MULTILINE),
]


def _parse_clauses(text: str) -> list[Clause]:
    """Split text into clauses by detected headings."""
    # Find all heading positions
    matches: list[tuple[int, int, str]] = []  # (start, end, title)
    for pattern in _CLAUSE_PATTERNS:
        for m in pattern.finditer(text):
            matches.append((m.start(), m.end(), m.group(1).strip()))

    if not matches:
        # Fallback: split on double newlines into paragraphs
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        return [
            Clause(index=i + 1, title=f"Parágrafo {i + 1}", text=p)
            for i, p in enumerate(paragraphs[:50])  # cap at 50
        ]

    # Sort by position
    matches.sort(key=lambda x: x[0])

    clauses: list[Clause] = []
    for i, (start, end, title) in enumerate(matches):
        # Content: from end of this heading to start of next heading
        next_start = matches[i + 1][0] if i + 1 < len(matches) else len(text)
        content = text[end:next_start].strip()
        clauses.append(Clause(index=i + 1, title=title, text=content))

    return clauses


# ---------------------------------------------------------------------------
# Tool: diff_clauses
# ---------------------------------------------------------------------------

def diff_clauses(v1_clauses: list[dict], v2_clauses: list[dict]) -> list[dict]:
    """
    Compute clause-level diff between two contract versions.

    Matches clauses by title (fuzzy). Returns list of ClauseDiff dicts.
    """
    # Build title → text maps
    v1_map = {c["title"].lower().strip(): c for c in v1_clauses}
    v2_map = {c["title"].lower().strip(): c for c in v2_clauses}

    all_titles = list(dict.fromkeys(
        list(v1_map.keys()) + list(v2_map.keys())
    ))

    diffs: list[dict] = []

    for title_key in all_titles:
        c1 = v1_map.get(title_key)
        c2 = v2_map.get(title_key)
        display_title = (c1 or c2)["title"]  # type: ignore[index]

        if c1 and not c2:
            diffs.append({
                "change_type": "removed",
                "clause_index": c1["index"],
                "title": display_title,
                "old_text": c1["text"],
                "new_text": "",
                "diff_lines": [],
            })
        elif c2 and not c1:
            diffs.append({
                "change_type": "added",
                "clause_index": c2["index"],
                "title": display_title,
                "old_text": "",
                "new_text": c2["text"],
                "diff_lines": [],
            })
        else:
            # Both exist — compute text diff
            old_text = (c1 or {}).get("text", "")
            new_text = (c2 or {}).get("text", "")
            if old_text == new_text:
                change_type = "unchanged"
                diff_lines: list[str] = []
            else:
                change_type = "changed"
                diff_lines = list(difflib.unified_diff(
                    old_text.splitlines(),
                    new_text.splitlines(),
                    lineterm="",
                    n=2,
                ))
            diffs.append({
                "change_type": change_type,
                "clause_index": (c1 or c2)["index"],  # type: ignore[index]
                "title": display_title,
                "old_text": old_text,
                "new_text": new_text,
                "diff_lines": diff_lines,
            })

    return [d for d in diffs if d["change_type"] != "unchanged"]


# ---------------------------------------------------------------------------
# Tool: summarize_changes
# ---------------------------------------------------------------------------

def summarize_changes(diffs: list[dict]) -> str:
    """
    Produce a plain-Portuguese summary of contract changes.
    Used as a fallback when LLM is unavailable.
    """
    if not diffs:
        return "Nenhuma alteração identificada entre as versões do contrato."

    added = [d for d in diffs if d["change_type"] == "added"]
    removed = [d for d in diffs if d["change_type"] == "removed"]
    changed = [d for d in diffs if d["change_type"] == "changed"]

    lines = [f"Foram identificadas {len(diffs)} alterações no contrato:\n"]

    if added:
        lines.append(f"• {len(added)} cláusula(s) adicionada(s):")
        for d in added:
            lines.append(f"  – {d['title']}")

    if removed:
        lines.append(f"• {len(removed)} cláusula(s) removida(s):")
        for d in removed:
            lines.append(f"  – {d['title']}")

    if changed:
        lines.append(f"• {len(changed)} cláusula(s) modificada(s):")
        for d in changed:
            lines.append(f"  – {d['title']}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Non-ADK fallback
# ---------------------------------------------------------------------------

def compare_contracts_fallback(pdf_path_v1: str, pdf_path_v2: str) -> dict:
    """
    Compare two contracts without LLM — returns raw diff + basic summary.
    """
    clauses_v1 = extract_contract_clauses(pdf_path_v1)
    clauses_v2 = extract_contract_clauses(pdf_path_v2)
    diffs = diff_clauses(clauses_v1, clauses_v2)
    summary = summarize_changes(diffs)

    return {
        "clauses_v1_count": len(clauses_v1),
        "clauses_v2_count": len(clauses_v2),
        "changes": diffs,
        "summary_pt": summary,
        "model_used": "rule-based",
    }


# ---------------------------------------------------------------------------
# LlmAgent
# ---------------------------------------------------------------------------

_INSTRUCTION = """
You are DocumentComparisonAgent for Real Estate OS — a specialist in Brazilian
residential lease contract review.

Workflow:
1. Call extract_contract_clauses(pdf_path) for both contract versions.
2. Call diff_clauses(v1_clauses, v2_clauses) to identify changes.
3. Call summarize_changes(diffs) for a rule-based summary.
4. Enhance the summary with your own analysis: explain in plain Portuguese
   what each change means legally/practically for the tenant and landlord.
5. Flag any changes that may be unfavourable to the tenant (rent increases,
   new restrictions, shortened notice periods).

Output format (JSON):
{
  "changes_count": N,
  "summary_pt": "...",
  "highlighted_changes": [
    {"title": "...", "change_type": "...", "impact": "...", "severity": "low|medium|high"}
  ],
  "recommendation": "..."
}

Rules:
- Always ground analysis in the actual diff text.
- If a change is minor (punctuation, formatting), classify as low severity.
- If rent amount, deposit, or penalties change, classify as high severity.
- Recommend legal review for high-severity changes.
- Answer in Portuguese.
"""


def build_document_agent(tools: list) -> Any:
    """Build the DocumentComparisonAgent LlmAgent."""
    if not _ADK_AVAILABLE or LlmAgent is None:
        logger.warning("google-adk not installed — DocumentComparisonAgent ADK mode unavailable")
        return None

    return LlmAgent(
        name="DocumentComparisonAgent",
        model=settings.google_adk_model,
        instruction=_INSTRUCTION,
        tools=tools,
    )
