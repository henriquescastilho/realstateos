from uuid import uuid4


def build_object_key(tenant_id: str, property_id: str, filename: str) -> str:
    return f"{tenant_id}/{property_id}/{uuid4()}-{filename}"
