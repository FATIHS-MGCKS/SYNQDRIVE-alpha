# ZB-I P4 — Storage preflight (read-only, 2026-10-27)

## Backend

- **Object storage:** `DocumentExtractionModule` → `DOCUMENT_STORAGE` port (`LocalDocumentStorageService` dev; S3 private implementation in `s3-private-document-storage.service.ts` for production paths).
- **Encryption / transport:** Declared via `DOCUMENT_STORAGE_ENCRYPTION_DECLARED` + `documentRetention.encryptionAtRest` snapshot on upload (`DocumentLifecycleService.buildStorageCapabilitiesSnapshot`).
- **Tenant + vehicle:** `VehicleDocumentExtraction.organizationId` + `vehicleId`; upload context resolver enforces org scope.
- **Malware / quarantine:** `DocumentMalwareScanService.storeScannedUpload`; download blocked when scan not clean (`isMalwareScanDownloadAllowed`).
- **Retention:** `DocumentRetentionService` phases (OCR cache, sensitive extracted data, final row) — master switch `DOCUMENT_RETENTION_ENABLED` default OFF.
- **Backups:** `DOCUMENT_STORAGE_BACKUP_*` documented in `document-retention.config.ts` (objects not included by default).

## P4 gates (no production activation in this PR)

- `ZB1_VEHICLE_REGISTRATION_DOCUMENT_P4_ENABLED=false` (default)
- `ZB1_REGISTRATION_DOCUMENT_P4_STORAGE_RELEASE_ACKNOWLEDGED=false`
- `ZB1_REGISTRATION_DOCUMENT_P4_GDPR_RELEASE_ACKNOWLEDGED=false`
- Upload of `REGISTRATION_CERTIFICATE` still requires `ZB1_REGISTRATION_CERTIFICATE_EXTRACTION_ENABLED` (P1/P2 path).
- **P4 OFF:** no new ZB-I persistence (`ZB1_REGISTRATION_DOCUMENT_P4_STORAGE_DISABLED`); existing ZB-I rows remain protected by the same ORG_ADMIN / `fleet.manage` ACL (not exposed via legacy list/download bypasses).
- **ZB1_REGISTRATION_DOCUMENT_P4_RETENTION_DAYS_AFTER_SOFT_DELETE=0:** disables timed post-soft-delete purge metadata — **not** immediate physical delete. Object bytes are removed on soft-delete (with retry via `pending_physical_object_delete` when storage delete fails).

## ACL (post-hardening)

- Central policy: `zb1-registration-certificate-access.policy.ts` — organization admins and `fleet.manage` only.
- `document-upload.read` / `write` / `manage` do **not** grant ZB-I read, download, or delete.
- `MASTER_ADMIN` has no implicit global bypass on ZB-I document paths.
