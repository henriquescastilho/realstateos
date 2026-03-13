def test_create_tenant_bootstraps_admin_and_returns_ids(client):
    response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Acme Realty",
            "admin_name": "Admin User",
            "admin_email": "admin@acme.com",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["tenant"]["name"] == "Acme Realty"
    assert body["admin_user"]["email"] == "admin@acme.com"
    assert body["admin_user"]["role"] == "admin"


def test_existing_user_can_exchange_email_and_tenant_for_jwt(client):
    tenant_response = client.post(
        "/api/v1/tenants",
        json={
            "name": "Beta Realty",
            "admin_name": "Beta Admin",
            "admin_email": "admin@beta.com",
        },
    )
    tenant_id = tenant_response.json()["tenant"]["id"]

    response = client.post(
        "/api/v1/auth/token",
        json={"tenant_id": tenant_id, "email": "admin@beta.com"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
