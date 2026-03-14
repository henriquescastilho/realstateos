"""Gemini Vision maintenance photo analyzer.

Accepts a photo (bytes or URL) of a maintenance issue and uses Gemini's
multimodal capabilities to:
    - Classify damage type (hydraulic, electrical, structural, etc.)
    - Estimate severity (low / medium / high / critical)
    - Suggest repair category and urgency
    - Auto-populate maintenance ticket fields

Non-ADK fallback: returns a rule-based response with minimal classification.
"""
from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependency guards
# ---------------------------------------------------------------------------
try:
    import google.generativeai as genai  # type: ignore
    _GENAI_AVAILABLE = True
except ImportError:
    genai = None  # type: ignore[assignment]
    _GENAI_AVAILABLE = False

try:
    import httpx  # type: ignore
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GEMINI_VISION_MODEL = "gemini-1.5-flash"   # multimodal-capable flash model

DAMAGE_CATEGORIES = [
    "hidraulica",
    "eletrica",
    "estrutural",
    "pintura",
    "vidracaria",
    "serralheria",
    "limpeza",
    "ar_condicionado",
    "telhado",
    "piso",
    "geral",
]

SEVERITY_LEVELS = ["low", "medium", "high", "critical"]

URGENCY_LABELS = {
    "critical": "imediato",
    "high": "urgente (48h)",
    "medium": "normal (7 dias)",
    "low": "pode aguardar (30 dias)",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class PhotoAnalysisResult:
    damage_category: str
    severity: str                  # low | medium | high | critical
    urgency: str                   # Portuguese urgency label
    description_pt: str            # Concise description for ticket
    suggested_title: str
    auto_fields: dict[str, Any]    # Fields to populate on the ticket
    model_used: str = "fallback"
    confidence: str = "low"


# ---------------------------------------------------------------------------
# Image loading
# ---------------------------------------------------------------------------

def _load_image_bytes(source: str | bytes) -> bytes:
    """Load image from URL, file path, or raw bytes."""
    if isinstance(source, bytes):
        return source

    if source.startswith(("http://", "https://")):
        if _HTTPX_AVAILABLE:
            try:
                response = httpx.get(source, timeout=10)
                response.raise_for_status()
                return response.content
            except Exception as exc:
                raise RuntimeError(f"Failed to fetch image: {exc}") from exc
        raise RuntimeError("httpx not available for URL image loading")

    # File path
    with open(source, "rb") as fh:
        return fh.read()


# ---------------------------------------------------------------------------
# Gemini Vision analysis
# ---------------------------------------------------------------------------

_ANALYSIS_PROMPT = """
Você é um especialista em manutenção predial no Brasil. Analise esta foto de um
imóvel residencial e identifique o problema de manutenção.

Responda em JSON com os seguintes campos:
{
  "damage_category": "<uma das categorias: hidraulica, eletrica, estrutural, pintura, vidracaria, serralheria, limpeza, ar_condicionado, telhado, piso, geral>",
  "severity": "<low|medium|high|critical>",
  "description_pt": "<descrição curta e objetiva do problema em português, máximo 2 frases>",
  "suggested_title": "<título para o chamado de manutenção, máximo 10 palavras>",
  "repair_notes": "<notas sobre o reparo recomendado, em português>",
  "confidence": "<low|medium|high>"
}

Critérios de severidade:
- critical: risco à segurança (fio exposto, estrutura comprometida, vazamento grave)
- high: problema funcional significativo (sem água, sem luz, goteira ativa)
- medium: problema de conforto/estética com impacto funcional (umidade, vidro quebrado)
- low: problema cosmético ou menor (pintura descascando, pequenos danos)
"""


def analyze_photo_with_gemini(
    image_source: str | bytes,
    api_key: str | None = None,
) -> PhotoAnalysisResult:
    """
    Analyze a maintenance photo using Gemini Vision.

    Args:
        image_source: URL, file path, or raw image bytes.
        api_key:      Google API key. Falls back to GOOGLE_API_KEY env var.

    Returns:
        PhotoAnalysisResult — never raises (degrades to fallback on error).
    """
    if not _GENAI_AVAILABLE:
        logger.info("photo_analyzer: google-generativeai not available — using fallback")
        return _fallback_result()

    import os  # noqa: PLC0415
    import json  # noqa: PLC0415

    key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        logger.warning("photo_analyzer: no Google API key — using fallback")
        return _fallback_result()

    try:
        image_bytes = _load_image_bytes(image_source)
    except Exception as exc:
        logger.warning("photo_analyzer: image load failed: %s", exc)
        return _fallback_result()

    try:
        genai.configure(api_key=key)
        model = genai.GenerativeModel(GEMINI_VISION_MODEL)

        # Determine MIME type
        mime_type = _guess_mime(image_bytes)

        response = model.generate_content(
            [
                _ANALYSIS_PROMPT,
                {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode()},
            ]
        )

        text = response.text.strip()

        # Extract JSON from response
        import re  # noqa: PLC0415
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("No JSON found in Gemini response")

        data = json.loads(match.group())

        category = data.get("damage_category", "geral")
        if category not in DAMAGE_CATEGORIES:
            category = "geral"

        severity = data.get("severity", "medium")
        if severity not in SEVERITY_LEVELS:
            severity = "medium"

        return PhotoAnalysisResult(
            damage_category=category,
            severity=severity,
            urgency=URGENCY_LABELS.get(severity, "normal (7 dias)"),
            description_pt=data.get("description_pt", ""),
            suggested_title=data.get("suggested_title", "Chamado de manutenção"),
            auto_fields={
                "type": "maintenance",
                "category": category,
                "priority": _severity_to_priority(severity),
                "description": data.get("description_pt", ""),
                "resolution_notes": data.get("repair_notes", ""),
            },
            model_used=GEMINI_VISION_MODEL,
            confidence=data.get("confidence", "medium"),
        )

    except Exception as exc:
        logger.warning("photo_analyzer: Gemini analysis failed: %s", exc)
        return _fallback_result()


def _guess_mime(data: bytes) -> str:
    """Guess MIME type from image magic bytes."""
    if data[:4] == b"\x89PNG":
        return "image/png"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:4] in (b"GIF8", b"GIF9"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"  # safe default


def _severity_to_priority(severity: str) -> str:
    mapping = {"critical": "critical", "high": "high", "medium": "medium", "low": "low"}
    return mapping.get(severity, "medium")


def _fallback_result() -> PhotoAnalysisResult:
    return PhotoAnalysisResult(
        damage_category="geral",
        severity="medium",
        urgency=URGENCY_LABELS["medium"],
        description_pt="Problema de manutenção identificado — análise visual indisponível.",
        suggested_title="Chamado de manutenção",
        auto_fields={
            "type": "maintenance",
            "category": "geral",
            "priority": "medium",
            "description": "Problema de manutenção identificado — análise visual indisponível.",
        },
        model_used="fallback",
        confidence="low",
    )


# ---------------------------------------------------------------------------
# Batch analysis
# ---------------------------------------------------------------------------

def analyze_ticket_photos(
    photo_sources: list[str | bytes],
    api_key: str | None = None,
) -> PhotoAnalysisResult:
    """
    Analyse multiple photos of the same ticket and return the worst-case result
    (highest severity among all photos, merged description).
    """
    if not photo_sources:
        return _fallback_result()

    results = [analyze_photo_with_gemini(src, api_key) for src in photo_sources]

    # Pick highest severity
    severity_order = {s: i for i, s in enumerate(SEVERITY_LEVELS)}
    best = max(results, key=lambda r: severity_order.get(r.severity, 0))

    if len(results) > 1:
        combined_desc = " | ".join(
            r.description_pt for r in results if r.description_pt
        )
        best.description_pt = combined_desc[:500]

    return best
