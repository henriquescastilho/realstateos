from datetime import date
from io import BytesIO

import pytest
from pypdf import PdfWriter


def build_pdf_bytes() -> bytes:
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buffer)
    return buffer.getvalue()


@pytest.mark.parametrize("prefix", ["", "/api"])
def test_hackathon_billing_flow_without_auth(client, prefix: str):
    owner_response = client.post(
        f"{prefix}/owners",
        json={
            "name": "Owner Demo",
            "document": "123",
            "email": "owner@demo.com",
            "phone": "1111",
        },
    )
    assert owner_response.status_code == 201
    owner_id = owner_response.json()["id"]

    property_response = client.post(
        f"{prefix}/properties",
        json={
            "address": "Rua Demo, 100",
            "city": "Sao Paulo",
            "state": "SP",
            "zip": "01000-000",
            "owner_id": owner_id,
            "iptu_registration_number": "IPTU-100",
        },
    )
    assert property_response.status_code == 201
    property_id = property_response.json()["id"]

    renter_response = client.post(
        f"{prefix}/renters",
        json={
            "name": "Renter Demo",
            "document": "456",
            "email": "renter@demo.com",
            "phone": "2222",
        },
    )
    assert renter_response.status_code == 201
    renter_id = renter_response.json()["id"]

    contract_response = client.post(
        f"{prefix}/contracts",
        json={
            "property_id": property_id,
            "renter_id": renter_id,
            "start_date": str(date(2026, 1, 1)),
            "end_date": str(date(2026, 12, 31)),
            "monthly_rent": "2000.00",
            "due_day": 1,
        },
    )
    assert contract_response.status_code == 201
    contract_id = contract_response.json()["id"]

    monthly_charge_response = client.post(
        f"{prefix}/charges/generate-monthly",
        json={"contract_id": contract_id, "reference_month": "2026-02-01"},
    )
    assert monthly_charge_response.status_code == 201
    assert monthly_charge_response.json()[0]["type"] == "RENT"

    iptu_response = client.post(
        f"{prefix}/documents/upload",
        data={
            "property_id": property_id,
            "type": "IPTU",
            "extracted_amount": "300.00",
            "extracted_due_date": "2026-02-10",
        },
        files={"file": ("iptu.pdf", build_pdf_bytes(), "application/pdf")},
    )
    condo_response = client.post(
        f"{prefix}/documents/upload",
        data={
            "property_id": property_id,
            "type": "CONDO",
            "extracted_amount": "500.00",
            "extracted_due_date": "2026-02-05",
        },
        files={"file": ("condo.pdf", build_pdf_bytes(), "application/pdf")},
    )
    assert iptu_response.status_code == 201
    assert condo_response.status_code == 201

    documents_response = client.get(f"{prefix}/documents")
    assert documents_response.status_code == 200
    assert len(documents_response.json()) == 2

    charges_response = client.get(f"{prefix}/charges")
    charges_before_consolidation = charges_response.json()
    assert len(charges_before_consolidation) == 3
    assert {charge["type"] for charge in charges_before_consolidation} == {"RENT", "IPTU", "CONDO"}

    consolidation_response = client.post(
        f"{prefix}/charges/consolidate",
        json={"contract_id": contract_id, "reference_month": "2026-02-01"},
    )
    assert consolidation_response.status_code == 201
    assert consolidation_response.json()["total_amount"] == "2800.00"

    consolidated_charge = next(
        charge for charge in client.get(f"{prefix}/charges").json() if charge["type"] == "CONSOLIDATED"
    )
    payment_response = client.post(f"{prefix}/charges/{consolidated_charge['id']}/generate-payment")
    assert payment_response.status_code == 200
    assert payment_response.json()["boleto_url"]
    assert payment_response.json()["pix_qrcode"]

    tasks_response = client.get(f"{prefix}/tasks")
    assert tasks_response.status_code == 200
    task_types = {task["type"] for task in tasks_response.json()}
    assert {"GENERATE_MONTHLY_CHARGE", "CONSOLIDATE_CHARGES", "GENERATE_PAYMENT"} <= task_types
