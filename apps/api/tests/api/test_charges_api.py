from datetime import date


def _auth_setup(client):
    tenant_response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Delta Realty",
            "admin_name": "Delta Admin",
            "admin_email": "admin@delta.com",
        },
    )
    tenant_id = tenant_response.json()["tenant"]["id"]

    token_response = client.post(
        "/api/v1/auth/token",
        json={"tenant_id": tenant_id, "email": "admin@delta.com"},
    )
    headers = {"Authorization": f"Bearer {token_response.json()['access_token']}"}

    owner_id = client.post(
        "/api/v1/owners",
        headers=headers,
        json={
            "name": "Owner Delta",
            "document": "123",
            "email": "owner@delta.com",
            "phone": "4444",
        },
    ).json()["id"]

    property_id = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "address": "Rua Delta, 500",
            "city": "Sao Paulo",
            "state": "SP",
            "zip": "01000-100",
            "owner_id": owner_id,
            "iptu_registration_number": "IPTU-500",
        },
    ).json()["id"]

    renter_id = client.post(
        "/api/v1/renters",
        headers=headers,
        json={
            "name": "Renter Delta",
            "document": "555",
            "email": "renter@delta.com",
            "phone": "5555",
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

    return headers, contract_id


def test_generate_monthly_charge_and_payment_links(client):
    headers, contract_id = _auth_setup(client)

    generate_response = client.post(
        "/api/v1/charges/generate_monthly",
        headers=headers,
        json={"contract_id": contract_id, "reference_month": "2026-02-01"},
    )

    assert generate_response.status_code == 201
    charge = generate_response.json()[0]
    assert charge["type"] == "RENT"
    assert charge["amount"] == "2000.00"
    assert charge["due_date"] == "2026-02-02"
    assert charge["status"] == "pending"

    boleto_response = client.post(f"/api/v1/charges/{charge['id']}/generate_boleto", headers=headers)
    pix_response = client.post(f"/api/v1/charges/{charge['id']}/generate_pix", headers=headers)

    assert boleto_response.status_code == 200
    assert boleto_response.json()["boleto_url"]
    assert boleto_response.json()["barcode"]

    assert pix_response.status_code == 200
    assert pix_response.json()["pix_qrcode"]
