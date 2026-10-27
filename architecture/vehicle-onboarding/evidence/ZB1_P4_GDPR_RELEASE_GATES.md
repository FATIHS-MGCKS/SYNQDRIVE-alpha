# ZB-I P4 — GDPR / Mistral OCR release gates

## Data flow (code contract)

1. **Upload** stores bytes only in private object storage (`objectKey` on `VehicleDocumentExtraction`).
2. **OCR** runs via existing document-extraction processor / Mistral path when queue enabled — **no live OCR in CI tests**.
3. **Vehicle AI V2** (P3) receives structured ZB-I fields from `extractedData.zb1RegistrationCertificate` only — not raw document bytes.
4. **P4 lifecycle metadata** (`mistralTransfer` in pipeline plausibility) records that bytes are OCR-bound only; no raw OCR in audit logs (retention strip helpers).

## Owner release prerequisites (not legal advice)

Before setting `ZB1_REGISTRATION_DOCUMENT_P4_*_ACKNOWLEDGED=true` in production:

- DPA / AVV with Mistral (or configured OCR provider) reviewed
- Sub-processor list updated
- Transfer impact (third country) assessed
- Retention days configured (`ZB1_REGISTRATION_DOCUMENT_P4_RETENTION_DAYS_AFTER_SOFT_DELETE`)
- `DOCUMENT_STORAGE_ENCRYPTION_DECLARED=true` with verified at-rest encryption

This repository does **not** invent statutory retention periods.
