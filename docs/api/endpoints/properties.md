# Properties

The Property Registry maintains canonical records of all rental properties managed by a tenant.

Base path: `/v1/properties`
Auth: **Demo**

---

## Create Property

`POST /v1/properties`

### Request Body

```json
{
  "address": "Av. Paulista, 1000 — Apto 42",
  "city": "São Paulo",
  "state": "SP",
  "zip_code": "01310-100",
  "area_m2": 65.0,
  "bedrooms": 2,
  "bathrooms": 1,
  "type": "apartment",
  "description": "Well-lit apartment in central location"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Full street address |
| `city` | string | Yes | City name |
| `state` | string | Yes | 2-letter Brazilian state code |
| `zip_code` | string | Yes | CEP format (`XXXXX-XXX`) |
| `area_m2` | float | No | Property area in square meters |
| `bedrooms` | int | No | Number of bedrooms |
| `bathrooms` | int | No | Number of bathrooms |
| `type` | string | No | `apartment`, `house`, `commercial`, `studio` |
| `description` | string | No | Free-text description |

### Response `201 Created`

```json
{
  "id": "prop_01HX...",
  "tenant_id": "acme-corp",
  "address": "Av. Paulista, 1000 — Apto 42",
  "city": "São Paulo",
  "state": "SP",
  "zip_code": "01310-100",
  "area_m2": 65.0,
  "bedrooms": 2,
  "bathrooms": 1,
  "type": "apartment",
  "active_contract_id": null,
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## List Properties

`GET /v1/properties`

Returns all properties for the tenant.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `city` | string | Filter by city |
| `state` | string | Filter by state |
| `type` | string | Filter by property type |
| `vacant` | bool | If `true`, return only properties without active contracts |
| `page` | int | Page number |
| `per_page` | int | Items per page |

---

## Get Property

`GET /v1/properties/{property_id}`

Returns a single property.

---

## Update Property

`PATCH /v1/properties/{property_id}`

Updates one or more fields. Only provided fields are changed.

---

## Delete Property

`DELETE /v1/properties/{property_id}`

Soft-deletes the property. Properties with active contracts cannot be deleted.
