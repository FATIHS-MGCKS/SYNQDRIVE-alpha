# Legal Documents — Private Object Storage (Prompt 13/32)

**Date:** 2026-07-22  
**Status:** Implemented  
**Branch:** `cursor/legal-docs-storage-adapter-28ca`

## Storage abstraction

```
DocumentStoragePort (DOCUMENTS_STORAGE)
├── LocalDocumentStorageService          (development / test only)
└── S3PrivateDocumentStorageService      (production — private S3-compatible bucket)
```

Shared utilities:
- `document-storage-key.util.ts` — server-generated, tenant-scoped object keys
- `document-storage-content-hash.util.ts` — SHA-256 metadata
- `document-storage-content-disposition.util.ts` — safe `Content-Disposition` for authorized downloads

Startup: `DocumentStorageStartupService` + `validateDocumentStorageConfig`  
Health: `DocumentStorageHealthService` (disk writable / S3 `HeadBucket`)

## Production requirements

| Requirement | Enforcement |
|-------------|-------------|
| Private object storage | `DOCUMENT_STORAGE_PROVIDER=s3` in production |
| No local disk in prod | Startup fails when `local` unless `DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true` |
| Tenant isolation | Object keys always include `organizations/{orgId}/…` — never from client paths |
| No public ACLs | S3 `PutObject` / `CopyObject` without ACL; no presigned public URLs |
| Server-side encryption | `DOCUMENT_PRIVATE_S3_SSE=AES256` (default) or `aws:kms` + KMS key |
| Authorized downloads only | Controllers stream via `getObjectStream`; `Cache-Control: no-store` |
| Hash metadata | `content-sha256` stored in S3 object metadata; returned as `contentHash` |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENT_STORAGE_PROVIDER` | `local` | `local` (dev/test) or `s3` (production) |
| `DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` | `false` | Explicit override for local disk in production |
| `LOCAL_DOCUMENT_STORAGE_DIR` | `./storage/documents` | Local clean zone (dev/test) |
| `LOCAL_DOCUMENT_QUARANTINE_STORAGE_DIR` | `./storage/documents-quarantine` | Local quarantine zone |
| `DOCUMENT_PRIVATE_S3_BUCKET` | — | Private bucket name (required for `s3`) |
| `DOCUMENT_PRIVATE_S3_REGION` | `auto` | AWS / compatible region |
| `DOCUMENT_PRIVATE_S3_ENDPOINT` | — | S3-compatible endpoint (R2, Hetzner, MinIO) |
| `DOCUMENT_PRIVATE_S3_ACCESS_KEY_ID` | — | IAM / service account key |
| `DOCUMENT_PRIVATE_S3_SECRET_ACCESS_KEY` | — | Secret (Runtime Secret in Cursor) |
| `DOCUMENT_PRIVATE_S3_FORCE_PATH_STYLE` | `true` | Path-style URLs for compatible providers |
| `DOCUMENT_PRIVATE_S3_KEY_PREFIX` | — | Optional namespace prefix inside bucket |
| `DOCUMENT_PRIVATE_S3_SSE` | `AES256` | `AES256` or `aws:kms` |
| `DOCUMENT_PRIVATE_S3_KMS_KEY_ID` | — | Required when SSE is `aws:kms` |
| `DOCUMENT_STORAGE_HEALTH_ALERT_THRESHOLD` | `5` | Consecutive health failures before ALERT log |

**Note:** Private document storage uses `DOCUMENT_PRIVATE_S3_*` — separate from public `STORAGE_DRIVER` / `S3_*` used for `/uploads` assets.

## Encryption configuration

| Layer | Setting |
|-------|---------|
| At rest (S3) | SSE-S3 (`AES256`) default; optional SSE-KMS with customer-managed key |
| In transit | HTTPS to S3 endpoint; downloads only via TLS-terminated API |
| Local dev | Filesystem permissions on VPS / agent workspace — not for production |

## Bucket permissions (recommended IAM policy)

Minimum permissions for the SynqDrive service account:

- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:HeadObject`
- `s3:ListBucket` (optional — health check uses `HeadBucket`)
- `s3:PutObject` / `s3:CopyObject` with `s3:x-amz-server-side-encryption` condition

**Deny:**
- `s3:PutObjectAcl`, `s3:PutBucketAcl`
- Public bucket policies (`Principal: *`)
- Anonymous `GetObject`

Enable **Block Public Access** on the bucket (AWS: all four settings ON).

## Versioning

- Enable **bucket versioning** on the production private bucket.
- Versioning protects against accidental overwrites during migration and operations.
- Lifecycle rule: expire non-current versions after retention window (e.g. 90 days) once backup strategy is verified.

## Backup requirements

| Item | Requirement |
|------|-------------|
| Database metadata | Included in existing VPS pre-deploy DB backup |
| Object bytes | **Not** in DB — require separate object backup (replication, cross-region sync, or provider backup) |
| `DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS` | Set `true` only when object backup is operational |
| Recovery test | Periodic restore drill: sample object key + DB row |

## Local → object storage migration

Existing files under `LOCAL_DOCUMENT_STORAGE_DIR` remain on disk until migrated.

### Phase 1 — Deploy S3 adapter (read-compatible)

1. Provision private bucket with SSE + Block Public Access.
2. Set `DOCUMENT_STORAGE_PROVIDER=s3` and `DOCUMENT_PRIVATE_S3_*` credentials.
3. New uploads go to S3; existing DB rows keep legacy `objectKey` values pointing at local paths.

### Phase 2 — Backfill script (ops)

For each `GeneratedDocument` / `OrganizationLegalDocument` with `storageProvider=local`:

1. Read file via `LocalDocumentStorageService.getObject(objectKey)`.
2. `putObject` to S3 (same org scope — new key generated).
3. Update DB: `objectKey`, `storageProvider=s3`, `contentHash`.
4. Verify download via API.
5. Delete local file after verification window.

### Phase 3 — Cutover

- Run backfill until zero `storageProvider=local` rows for active documents.
- Remove `DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` if set.
- Archive local `./storage/documents` directory after retention period.

**Rollback:** Revert `DOCUMENT_STORAGE_PROVIDER=local` only if `DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true` and unmigrated files still exist on disk.

## Object key layout

```
organizations/{orgId}/legal/{documentType}/{yyyy}/{mm}/{uuid}-{safeName}
organizations/{orgId}/bookings/{bookingId}/{documentType}/{yyyy}/{mm}/{uuid}-{safeName}
quarantine/organizations/{orgId}/legal/…
```

Client filenames and paths are **never** used as key segments.

## Test results

Suite: `document-storage.contract.spec.ts`, `document-storage.config-validator.spec.ts`, existing `documents.service.spec.ts`

| Scenario | Local | S3 (in-memory) |
|----------|-------|----------------|
| Safe key generation | PASS | PASS |
| Upload / download roundtrip | PASS | PASS |
| Quarantine promotion | PASS | PASS |
| Content hash metadata | PASS | PASS |
| Path traversal rejection | PASS | PASS |
| Health check | PASS | PASS |
| Production + local without override | FAIL (expected) | — |
| Valid S3 config | — | PASS |

**Total legal-documents scope:** 238 tests passing (includes contract tests for both adapters).

## Security decisions

- No permanent public URLs — downloads only through org-scoped API with permission checks.
- Range requests not exposed to clients (full stream via Nest `StreamableFile`).
- S3 SDK lazy-loaded — optional dependency until `s3` provider is selected.
- Quarantine → clean promotion uses server-side `CopyObject` + delete (S3) or read/write (local).

## Changes / Architektur

- **Changes:** updated (`legal-documents-private-storage-2026-07-22`)
- **Architektur:** updated (`LEGAL_DOCUMENT_PRIVATE_STORAGE_2026-07-22`)
