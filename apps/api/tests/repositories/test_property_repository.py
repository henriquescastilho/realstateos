from app.models.owner import Owner
from app.models.property import Property
from app.models.tenant import Tenant
from app.repositories.property_repo import list_properties_for_tenant


def test_list_properties_for_tenant_returns_only_records_from_current_tenant(db_session):
    tenant_a = Tenant(name="Tenant A")
    tenant_b = Tenant(name="Tenant B")

    owner_a = Owner(
        tenant=tenant_a,
        name="Owner A",
        document="123",
        email="a@example.com",
        phone="1111",
    )
    owner_b = Owner(
        tenant=tenant_b,
        name="Owner B",
        document="456",
        email="b@example.com",
        phone="2222",
    )

    property_a = Property(
        tenant=tenant_a,
        owner=owner_a,
        address="Rua A, 100",
        city="Sao Paulo",
        state="SP",
        zip="01000-000",
        iptu_registration_number="A-1",
    )
    property_b = Property(
        tenant=tenant_b,
        owner=owner_b,
        address="Rua B, 200",
        city="Rio de Janeiro",
        state="RJ",
        zip="20000-000",
        iptu_registration_number="B-1",
    )

    db_session.add_all([tenant_a, tenant_b, owner_a, owner_b, property_a, property_b])
    db_session.commit()

    results = list_properties_for_tenant(db_session, tenant_a.id)

    assert len(results) == 1
    assert results[0].id == property_a.id
    assert results[0].tenant_id == tenant_a.id
