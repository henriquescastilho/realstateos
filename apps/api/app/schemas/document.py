from pydantic import BaseModel

from app.schemas.common import ORMModel


class DocumentRead(ORMModel):
    id: str
    tenant_id: str
    property_id: str
    type: str
    file_url: str
    parsed_data: dict


class EmailIngestionRequest(BaseModel):
    property_id: str | None = None
    sender: str
    subject: str
    attachments: list["MailboxAttachment"] = []


class MailboxAttachment(BaseModel):
    filename: str
    content_base64: str
    type: str


EmailIngestionRequest.model_rebuild()
