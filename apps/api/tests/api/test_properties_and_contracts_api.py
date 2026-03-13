from datetime import date


def _auth_headers(client):
    tenant_response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Gamma Realty",
            "admin_name": "Gamma Admin",
            "admin_email": "admin@gamma.com",
        },
    )
    tenant_id = tenant_response.json()["tenant"]["id"]

    token_response = client.post(
        "/api/v1/auth/token",
        json={"tenant_id": tenant_id, "email": "admin@gamma.com"},
    )
    token = token_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, tenant_id


def test_create_and_list_properties_is_tenant_scoped(client):
    headers, _tenant_id = _auth_headers(client)

    owner_response = client.post(
        "/api/v1/owners",
        headers=headers,
        json={
            "name": "Owner A",
            "document": "123",
            "email": "owner@gamma.com",
            "phone": "1111",
        },
    )
    owner_id = owner_response.json()["id"]

    create_response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "address": "Rua A, 100",
            "city": "Sao Paulo",
            "state": "SP",
            "zip": "01000-000",
            "owner_id": owner_id,
            "iptu_registration_number": "IPTU-123",
        },
    )

    assert create_response.status_code == 201

    list_response = client.get("/api/v1/properties", headers=headers)
    properties = list_response.json()

    assert list_response.status_code == 200
    assert len(properties) == 1
    assert properties[0]["address"] == "Rua A, 100"


def test_create_and_list_contracts(client):
    headers, _tenant_id = _auth_headers(client)

    owner_id = client.post(
        "/api/v1/owners",
        headers=headers,
        json={
            "name": "Owner Contract",
            "document": "789",
            "email": "owner.contract@gamma.com",
            "phone": "2222",
        },
    ).json()["id"]

    property_id = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "address": "Rua Contrato, 300",
            "city": "Campinas",
            "state": "SP",
            "zip": "13000-000",
            "owner_id": owner_id,
            "iptu_registration_number": "IPTU-789",
        },
    ).json()["id"]

    renter_response = client.post(
        "/api/v1/renters",
        headers=headers,
        json={
            "name": "Renter One",
            "document": "999",
            "email": "renter@gamma.com",
            "phone": "3333",
        },
    )
    renter_id = renter_response.json()["id"]

    contract_response = client.post(
        "/api/v1/contracts",
        headers=headers,
        json={
            "property_id": property_id,
            "renter_id": renter_id,
            "start_date": str(date(2026, 1, 1)),
            "end_date": str(date(2026, 12, 31)),
            "monthly_rent": "2500.00",
            "due_day": 1,
        },
    )

    assert contract_response.status_code == 201

    list_response = client.get("/api/v1/contracts", headers=headers)

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["monthly_rent"] == "2500.00"
