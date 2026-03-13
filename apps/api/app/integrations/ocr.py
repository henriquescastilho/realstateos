from datetime import datetime
from io import BytesIO
from re import search

from pypdf import PdfReader


def parse_pdf_document(filename: str, file_bytes: bytes) -> dict:
    text = extract_text(file_bytes)
    amount_match = search(r"(\d+[.,]\d{2})", text)
    due_date_match = search(r"(\d{2}/\d{2}/\d{4})", text)

    return {
        "filename": filename,
        "issuer": text.splitlines()[0] if text else "unknown",
        "amount": amount_match.group(1) if amount_match else None,
        "due_date": _to_iso_date(due_date_match.group(1)) if due_date_match else None,
        "raw_text": text[:4000],
    }


def extract_text(file_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(file_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def _to_iso_date(value: str) -> str:
    return datetime.strptime(value, "%d/%m/%Y").date().isoformat()
