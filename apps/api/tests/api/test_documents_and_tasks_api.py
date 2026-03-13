import base64
from datetime import date
from io import BytesIO

from pypdf import PdfWriter


def _build_pdf_bytes() -> bytes:
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buffer)
    return buffer.getvalue()


def _setup_authenticated_contract(client):
    tenant_response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Docs Realty",
            "admin_name": "Docs Admin",
            "admin_email": "admin@docs.com",
        },
    )
    tenant_id = tenant_response.json()["tenant"]["id"]
    token_response = client.post(
        "/api/v1/auth/token",
        json={"tenant_id": tenant_id, "email": "admin@docs.com"},
    )
    headers = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

    owner_id = client.post(
        "/api/v1/owners",
        headers=headers,
        json={
            "name": "Owner Docs",
            "document": "111",
            "email": "owner@docs.com",
            "phone": "9999",
        },
    ).json()["id"]

    property_id = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "address": "Rua Documento, 1",
            "city": "Sao Paulo",
            "state": "SP",
            "zip": "01000-111",
            "owner_id": owner_id,
            "iptu_registration_number": "IPTU-DOCS",
        },
    ).json()["id"]

    renter_id = client.post(
        "/api/v1/renters",
        headers=headers,
        json={
            "name": "Renter Docs",
            "document": "222",
            "email": "renter@docs.com",
            "phone": "8888",
        },
    ).json()["id"]

    contract_id = client.post(
        "/api/v1/contracts",
        headers=headers,
        json={
            "property_id": property_id,
            "renter_id": renter_id,
            "start_date": str(date(2026, 1, 1)),
            "end_date": str(date(2026, 12, 31)),
            "monthly_rent": "2000.00",
            "due_day": 1,
        },
    ).json()["id"]

    return headers, property_id, contract_id


def test_upload_document_attaches_pdf_to_property(client):
    headers, property_id, _contract_id = _setup_authenticated_contract(client)
    pdf_bytes = _build_pdf_bytes()

    response = client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("condo.pdf", pdf_bytes, "application/pdf")},
        data={"property_id": property_id, "type": "CONDO"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["property_id"] == property_id
    assert body["type"] == "CONDO"
    assert "parsed_data" in body


def test_mailbox_ingestion_creates_document_for_pdf_attachment(client):
    headers, property_id, _contract_id = _setup_authenticated_contract(client)
    attachment_b64 = base64.b64encode(_build_pdf_bytes()).decode("utf-8")

    response = client.post(
        "/api/v1/documents/mailbox",
        headers=headers,
        json={
            "property_id": property_id,
            "sender": "condo@example.com",
            "subject": "Condominio",
            "attachments": [
                {"filename": "condo_bill.pdf", "content_base64": attachment_b64, "type": "CONDO"}
            ],
        },
    )

    assert response.status_code == 202
    assert response.json()["ingested_documents"] == 1

    list_response = client.get("/api/v1/documents", headers=headers)
    assert len(list_response.json()) == 1


def test_run_task_creates_pending_task_record(client):
    headers, property_id, contract_id = _setup_authenticated_contract(client)

    response = client.post(
        "/api/v1/tasks/run",
        headers=headers,
        json={
            "type": "generate_charge",
            "payload": {"tenant_id": "from-token", "contract_id": contract_id, "reference_month": "2026-02-01"},
        },
    )

    assert response.status_code == 202
    assert response.json()["type"] == "GENERATE_MONTHLY_CHARGE"
    assert response.json()["status"] == "PENDING"


def test_charge_status_can_be_marked_paid(client):
    headers, _property_id, contract_id = _setup_authenticated_contract(client)
    charge = client.post(
        "/api/v1/charges/generate_monthly",
        headers=headers,
        json={"contract_id": contract_id, "reference_month": "2026-02-01"},
    ).json()[0]

    response = client.patch(
        f"/api/v1/charges/{charge['id']}/status",
        headers=headers,
        json={"status": "paid"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "paid"
