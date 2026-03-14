"""Document ingestion service — PDF parsing + Gemini multimodal extraction.

Expands the original upload_monthly_bill to also handle contract PDFs
with intelligent field extraction, confidence scoring, and escalation
for low-confidence extractions.
"""
from __future__ import annotations

import json
import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.charge import Charge
from app.models.contract import Contract
from app.models.document import Document
from app.models.property import Property
from app.services.document_service import create_document_record

logger = logging.getLogger(__name__)

# Confidence threshold below which we escalate to human review
_LOW_CONFIDENCE_THRESHOLD = 0.7


# ---------------------------------------------------------------------------
# Gemini multimodal extraction (with fallback to regex OCR)
# ---------------------------------------------------------------------------

def _extract_with_gemini(file_bytes: bytes, document_type: str) -> dict:
    """Use Gemini multimodal to extract structured fields from a PDF.

    Returns a dict with field values and confidence scores.
    Falls back to regex-based OCR on failure.
    """
    try:
        import google.generativeai as genai  # noqa: PLC0415

        prompt = _build_extraction_prompt(document_type)
        model = genai.GenerativeModel("gemini-2.0-flash")

        # Gemini accepts PDF bytes as inline_data
        response = model.generate_content(
            [
                prompt,
                {"inline_data": {"mime_type": "application/pdf", "data": file_bytes}},
            ]
        )
        text = response.text.strip()
        # Expect JSON response
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini extraction failed: %s — using regex fallback", exc)
        return _extract_with_regex(file_bytes)


def _build_extraction_prompt(document_type: str) -> str:
    if document_type == "CONTRACT":
        return """Extract structured data from this Brazilian real estate contract PDF.
Return ONLY valid JSON with this structure:
{
  "parties": {
    "landlord_name": {"value": "...", "confidence": 0.0-1.0},
    "landlord_cpf": {"value": "...", "confidence": 0.0-1.0},
    "tenant_name": {"value": "...", "confidence": 0.0-1.0},
    "tenant_cpf": {"value": "...", "confidence": 0.0-1.0}
  },
  "property": {
    "address": {"value": "...", "confidence": 0.0-1.0},
    "city": {"value": "...", "confidence": 0.0-1.0},
    "state": {"value": "...", "confidence": 0.0-1.0}
  },
  "financial": {
    "monthly_rent": {"value": "...", "confidence": 0.0-1.0},
    "due_day": {"value": "...", "confidence": 0.0-1.0}
  },
  "duration": {
    "start_date": {"value": "YYYY-MM-DD", "confidence": 0.0-1.0},
    "end_date": {"value": "YYYY-MM-DD", "confidence": 0.0-1.0}
  },
  "special_clauses": [{"text": "...", "confidence": 0.0-1.0}]
}
If a field cannot be found, set value to null and confidence to 0.0."""
    else:
        return """Extract key financial data from this Brazilian bill/invoice PDF.
Return ONLY valid JSON:
{
  "amount": {"value": "...", "confidence": 0.0-1.0},
  "due_date": {"value": "YYYY-MM-DD", "confidence": 0.0-1.0},
  "issuer": {"value": "...", "confidence": 0.0-1.0},
  "reference_period": {"value": "...", "confidence": 0.0-1.0}
}"""


def _extract_with_regex(file_bytes: bytes) -> dict:
    """Fallback: use pypdf + regex patterns (existing OCR approach)."""
    from app.integrations.ocr import parse_pdf_document  # noqa: PLC0415

    parsed = parse_pdf_document("document.pdf", file_bytes)
    return {
        "amount": {"value": parsed.get("amount"), "confidence": 0.5 if parsed.get("amount") else 0.0},
        "due_date": {"value": parsed.get("due_date"), "confidence": 0.5 if parsed.get("due_date") else 0.0},
        "issuer": {"value": parsed.get("issuer"), "confidence": 0.4},
        "_extraction_method": "regex",
    }


def _min_confidence(extracted: dict) -> float:
    """Find the minimum confidence score across all extracted fields."""
    scores = []
    for v in extracted.values():
        if isinstance(v, dict) and "confidence" in v:
            scores.append(float(v["confidence"]))
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict) and "confidence" in item:
                    scores.append(float(item["confidence"]))
    return min(scores) if scores else 0.0


# ---------------------------------------------------------------------------
# Public API — original function (preserved for backward compat)
# ---------------------------------------------------------------------------

def upload_monthly_bill(
    db: Session,
    tenant_id: str,
    property_id: str,
    document_type: str,
    filename: str,
    file_bytes: bytes,
    extracted_amount: str | None,
    extracted_due_date: str | None,
) -> Document:
    """Upload a monthly bill document and create a charge record if data is present.

    Original behavior preserved for backward compatibility.
    For richer extraction, use extract_contract_pdf() instead.
    """
    document = create_document_record(db, tenant_id, property_id, document_type, filename, file_bytes)

    property_record = db.scalar(
        select(Property).where(Property.id == property_id, Property.tenant_id == tenant_id)
    )
    contract = None
    if property_record is not None:
        contract = db.scalar(
            select(Contract).where(Contract.property_id == property_id, Contract.tenant_id == tenant_id)
        )

    if contract is not None and extracted_amount and extracted_due_date:
        charge = Charge(
            tenant_id=tenant_id,
            property_id=property_id,
            contract_id=contract.id,
            type=document_type,
            description=f"{document_type} uploaded bill",
            amount=Decimal(extracted_amount),
            due_date=date.fromisoformat(extracted_due_date),
            source="UPLOAD",
            status="pending",
        )
        db.add(charge)
        db.commit()

    return document


# ---------------------------------------------------------------------------
# Enhanced: Gemini-powered contract PDF extraction
# ---------------------------------------------------------------------------

def extract_contract_pdf(
    db: Session,
    tenant_id: str,
    property_id: str,
    filename: str,
    file_bytes: bytes,
) -> dict:
    """Extract structured contract data from a PDF using Gemini multimodal.

    Returns:
        {
            "document_id": str,
            "extracted_data": dict,
            "min_confidence": float,
            "requires_review": bool,
            "escalation_task_id": str | None,
        }
    """
    from app.services.task_service import create_task_record  # noqa: PLC0415

    # Store the raw document first
    document = create_document_record(
        db, tenant_id, property_id, "CONTRACT", filename, file_bytes
    )

    # Extract with Gemini (or fallback)
    extracted = _extract_with_gemini(file_bytes, "CONTRACT")
    min_conf = _min_confidence(extracted)
    requires_review = min_conf < _LOW_CONFIDENCE_THRESHOLD

    # Store extraction results in the document's parsed_data
    try:
        document.parsed_data = {  # type: ignore[attr-defined]
            "extracted_fields": extracted,
            "min_confidence": min_conf,
            "requires_review": requires_review,
            "extraction_method": extracted.pop("_extraction_method", "gemini"),
        }
        db.add(document)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not update document parsed_data: %s", exc)

    # Create escalation task if confidence is low
    escalation_task_id = None
    if requires_review:
        task = create_task_record(
            db=db,
            tenant_id=tenant_id,
            task_type="DOCUMENT_REVIEW",
            status_value="ESCALATED",
            message=(
                f"Low confidence extraction for contract PDF '{filename}' "
                f"(min confidence: {min_conf:.0%}). Manual review required."
            ),
            payload={
                "document_id": document.id,
                "filename": filename,
                "min_confidence": min_conf,
                "extracted_fields": extracted,
                "requires_human_review": True,
            },
            property_id=property_id,
        )
        escalation_task_id = task.id
        logger.warning(
            "Contract extraction escalated: doc=%s confidence=%.2f task=%s",
            document.id,
            min_conf,
            task.id,
        )
    else:
        logger.info(
            "Contract extraction successful: doc=%s confidence=%.2f",
            document.id,
            min_conf,
        )

    return {
        "document_id": document.id,
        "extracted_data": extracted,
        "min_confidence": min_conf,
        "requires_review": requires_review,
        "escalation_task_id": escalation_task_id,
    }


def extract_bill_pdf(
    db: Session,
    tenant_id: str,
    property_id: str,
    document_type: str,
    filename: str,
    file_bytes: bytes,
) -> dict:
    """Extract financial data from a bill PDF using Gemini multimodal.

    Creates a Charge record if extraction confidence is sufficient.
    Otherwise creates an escalation task for human review.
    """
    from app.services.task_service import create_task_record  # noqa: PLC0415

    document = create_document_record(
        db, tenant_id, property_id, document_type, filename, file_bytes
    )

    extracted = _extract_with_gemini(file_bytes, document_type)
    min_conf = _min_confidence(extracted)
    requires_review = min_conf < _LOW_CONFIDENCE_THRESHOLD

    amount_data = extracted.get("amount", {})
    due_date_data = extracted.get("due_date", {})
    amount_val = amount_data.get("value") if isinstance(amount_data, dict) else amount_data
    due_date_val = due_date_data.get("value") if isinstance(due_date_data, dict) else due_date_data

    charge = None
    if not requires_review and amount_val and due_date_val:
        contract = db.scalar(
            select(Contract).where(
                Contract.property_id == property_id,
                Contract.tenant_id == tenant_id,
            )
        )
        if contract:
            try:
                charge = Charge(
                    tenant_id=tenant_id,
                    property_id=property_id,
                    contract_id=contract.id,
                    type=document_type,
                    description=f"{document_type} — {filename}",
                    amount=Decimal(str(amount_val).replace(",", ".")),
                    due_date=date.fromisoformat(str(due_date_val)),
                    source="DOCUMENT_AI",
                    status="pending",
                )
                db.add(charge)
                db.commit()
                db.refresh(charge)
            except (InvalidOperation, ValueError) as exc:
                logger.warning("Could not create charge from extracted data: %s", exc)
                requires_review = True

    if requires_review:
        create_task_record(
            db=db,
            tenant_id=tenant_id,
            task_type="DOCUMENT_REVIEW",
            status_value="ESCALATED",
            message=f"Low confidence bill extraction for '{filename}' ({min_conf:.0%} confidence). Review required.",
            payload={
                "document_id": document.id,
                "filename": filename,
                "min_confidence": min_conf,
                "extracted": extracted,
            },
            property_id=property_id,
        )

    return {
        "document_id": document.id,
        "extracted_data": extracted,
        "min_confidence": min_conf,
        "requires_review": requires_review,
        "charge_id": charge.id if charge else None,
    }
