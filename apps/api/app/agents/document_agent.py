from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document


class DocumentAgent:
    def run(self, db: Session, task) -> dict:
        document = db.scalar(select(Document).where(Document.id == task.payload["document_id"]))
        if document is None:
            return {"status": "failed", "reason": "document_not_found"}
        return {"status": "completed", "document_id": document.id}

