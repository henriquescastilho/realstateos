# Uploads & Exports

## Uploads

Upload documents and media files. Files are stored in MinIO object storage.

Base path: `/v1/uploads`

### Upload File

`POST /v1/uploads`

```bash
curl -X POST /v1/uploads \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@contract.pdf" \
  -F "type=contract_pdf" \
  -F "entity_id=ctr_01HX..."
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | File to upload (max 50MB) |
| `type` | string | Yes | `contract_pdf`, `maintenance_photo`, `owner_statement`, `bank_statement` |
| `entity_id` | string | No | Associate with a contract, property, or ticket |

### Response `201 Created`

```json
{
  "id": "upload_01HX...",
  "tenant_id": "acme-corp",
  "filename": "contract.pdf",
  "content_type": "application/pdf",
  "size_bytes": 245312,
  "type": "contract_pdf",
  "entity_id": "ctr_01HX...",
  "url": "https://files.realstateos.io/uploads/...",
  "presigned_url": "https://minio.../...",
  "presigned_url_expires_at": "2024-02-15T11:00:00Z",
  "created_at": "2024-02-15T10:00:00Z"
}
```

The `presigned_url` is valid for 1 hour. Request a new presigned URL via `GET /v1/uploads/{upload_id}/presign`.

---

## Exports

Generate downloadable reports in various formats.

Base path: `/v1/exports`

### Create Export

`POST /v1/exports`

```json
{
  "entity": "billing_history",
  "format": "xlsx",
  "filters": {
    "date_from": "2024-01-01",
    "date_to": "2024-12-31",
    "status": "paid"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `entity` | string | `contracts`, `billing_history`, `payment_history`, `maintenance_report` |
| `format` | string | `csv`, `xlsx`, `pdf` |
| `filters` | object | Entity-specific filters |

### Response `202 Accepted`

```json
{
  "export_id": "exp_01HX...",
  "status": "pending",
  "message": "Export queued. You'll receive a webhook when ready."
}
```

### Get Export Status

`GET /v1/exports/{export_id}`

```json
{
  "id": "exp_01HX...",
  "status": "completed",
  "download_url": "https://minio.../exports/...",
  "download_url_expires_at": "2024-02-15T11:00:00Z",
  "rows": 1247,
  "size_bytes": 89342,
  "completed_at": "2024-02-15T10:01:30Z"
}
```
