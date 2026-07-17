# Runbook: Document Storage, Retention & Lifecycle

**Verbindliches Betriebs-Runbook** für Storage-Provider, Quarantäne/Clean-Zonen, Retention (Dry-Run), Legal Hold und endgültige Löschung von AI-Upload-Dokumenten.

| Feld | Wert |
|------|------|
| **Gültig ab** | Backend V4.9.624 (`DocumentLifecycleService`, `DocumentRetentionService`) |
| **Architektur** | [`architecture/DOCUMENT_STORAGE_LIFECYCLE_2026-07-17.md`](../../architecture/DOCUMENT_STORAGE_LIFECYCLE_2026-07-17.md) |
| **Scheduler** | `DocumentRetentionScheduler` — Cron `30 4 * * *` (04:30 UTC) |
| **Tenant-Scope** | Alle Retention-Phasen filtern optional per `organizationId` |

> **Grundsatz:** Retention ist **standardmäßig deaktiviert** (`DOCUMENT_RETENTION_ENABLED=false`). Wenn aktiviert, läuft sie **standardmäßig als Dry-Run** (`DOCUMENT_RETENTION_DRY_RUN=true`). Keine automatische Löschung ohne definierte Frist (`days=0` = Kategorie aus). Legal Hold blockiert Löschung und Retention.

---

## 1. Architekturüberblick

```text
Upload → identify/hash/duplicate → [optional] quarantine scan → clean storage
  → plausibility._pipeline.lifecycle (storage, retention, legalHold, mistralTransfer)
  → OCR/Mistral (mistralTransfer.status patched after OCR)
  → review/confirm/apply

Soft delete (DELETE .../file):
  → storage.deleteObject
  → objectKey=null, fileDeletedAt set
  → optional immediate OCR cache strip (DOCUMENT_DELETE_STRIP_OCR_CACHE)
  → audit action delete_file

Retention cron (enabled + dryRun configurable):
  1. ocr_cache_after_soft_delete
  2. sensitive_extracted_data_after_soft_delete
  3. final_row_after_soft_delete (only if no downstream links)
  4. rejected_without_file
```

### Storage-Zonen

| Zone | Pfad / Key-Präfix | Zweck |
|------|-------------------|-------|
| **Quarantine** | `LOCAL_DOCUMENT_QUARANTINE_STORAGE_DIR` / `quarantine/organizations/...` | Upload vor Malware-Scan (`DOCUMENT_MALWARE_SCAN_ENABLED=true`) |
| **Clean** | `LOCAL_DOCUMENT_STORAGE_DIR` / `organizations/...` | Freigegebene Dokumente nach CLEAN/NOT_SCANNED |

### Lifecycle-Metadaten (`plausibility._pipeline.lifecycle`)

| Block | Inhalt |
|-------|--------|
| `storage` | Provider, Zonen, Transport (HTTPS API), Encryption-at-rest capability, Backup-Status |
| `retention` | `policyVersion`, `fileSoftDeletedAt`, `ocrCachePurgedAt`, `sensitiveDataPurgedAt`, … |
| `legalHold` | `active`, `reason`, `setAt`, `setByUserId`, `clearedAt` |
| `mistralTransfer` | `status` (`not_sent` \| `sent` \| `completed` \| `failed`), `includesDocumentBytes`, `includesImageBase64`, `model`, `pageCount` |

Fachliche Audit-Metadaten (`plausibility.actionAudit`, Status, `extractedData` nach Confirm) können getrennt von Datei/OCR-Rohdaten erhalten bleiben — abhängig von Retention-Fristen.

---

## 2. Umgebungsvariablen

### 2.1 Master-Schalter

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `DOCUMENT_RETENTION_ENABLED` | `false` | Retention-Cron und manuelle Runs aktiv |
| `DOCUMENT_RETENTION_DRY_RUN` | `true` | Nur zählen/berichten, keine DB/Storage-Writes |
| `DOCUMENT_RETENTION_POLICY_VERSION` | `2026-07-17` | In Lifecycle-Snapshot geschrieben |
| `DOCUMENT_DELETE_STRIP_OCR_CACHE` | `true` | Bei manuellem Soft-Delete sofort `_pipeline.contentCache` entfernen |

### 2.2 Retention-Fristen (Tage; `0` = deaktiviert)

| Variable | Default | Phase |
|----------|---------|-------|
| `DOCUMENT_RETENTION_OCR_CACHE_AFTER_SOFT_DELETE_DAYS` | `90` | OCR-Rohdaten (`contentCache`) nach Soft-Delete |
| `DOCUMENT_RETENTION_SENSITIVE_EXTRACTED_DATA_DAYS` | `0` | String-Felder in `extractedData` redigieren |
| `DOCUMENT_RETENTION_ROW_AFTER_SOFT_DELETE_DAYS` | `0` | Endgültige DB-Zeile löschen (nur ohne Downstream-Links) |
| `DOCUMENT_RETENTION_REJECTED_WITHOUT_FILE_DAYS` | `30` | REJECTED ohne `objectKey` bereinigen |

### 2.3 Batch-Limits

| Variable | Default |
|----------|---------|
| `DOCUMENT_RETENTION_BATCH_SIZE` | `100` |
| `DOCUMENT_RETENTION_MAX_BATCHES` | `200` |

### 2.4 Storage-Capabilities (deklarativ)

| Variable | Default | Zweck |
|----------|---------|-------|
| `DOCUMENT_STORAGE_ENCRYPTION_DECLARED` | `false` | Encryption-at-rest Capability-Flag |
| `DOCUMENT_STORAGE_ENCRYPTION_PROVIDER` | `none` | `none` \| `local-disk` \| `s3-sse` \| `s3-kms` |
| `DOCUMENT_STORAGE_ENCRYPTION_KMS_KEY_ID` | — | Optional bei `s3-kms` |
| `DOCUMENT_STORAGE_BACKUP_STRATEGY` | `vps-pre-deploy-db` | `vps-pre-deploy-db` \| `manual` \| `none` |
| `DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS` | `false` | Ob Dokument-Objekte im Backup enthalten sind |
| `DOCUMENT_STORAGE_BACKUP_LAST_VERIFIED_AT` | — | ISO-Zeitstempel letzter Verifikation |
| `DOCUMENT_STORAGE_BACKUP_NOTE` | — | Freitext für Ops |

Transport: API-Upload/Download über HTTPS in Produktion (`apiTransport: https`). Lokaler Provider: `providerTransport: local-filesystem`.

---

## 3. API-Endpunkte (tenant-scoped)

| Methode | Pfad | Aktion |
|---------|------|--------|
| `DELETE` | `/vehicles/:vehicleId/document-extractions/:id/file` | Soft-Delete (Datei + optional OCR-Cache) |
| `POST` | `/vehicles/:vehicleId/document-extractions/:id/legal-hold` | Legal Hold setzen (`{ reason?: string }`) |
| `DELETE` | `/vehicles/:vehicleId/document-extractions/:id/legal-hold` | Legal Hold aufheben |
| `GET` | `.../download` | Download + Audit-Eintrag `download` |

Legal Hold blockiert `delete_file` (API + `allowedActions`). Retention überspringt betroffene Zeilen.

---

## 4. Manuelle Retention (Dry-Run)

### 4.1 Voraussetzungen

```bash
cd backend
npm ci
npx prisma generate
# DATABASE_URL auf Ziel-DB (Staging bevorzugt)
```

### 4.2 Dry-Run für eine Organisation

Über Nest-REPL oder temporäres Ops-Skript `DocumentRetentionService.runOnce`:

```typescript
await retention.runOnce({
  trigger: 'manual',
  dryRun: true,
  organizationId: '<org-uuid>',
});
```

Erwartung im Report:

- `dryRun: true`
- `phases[].candidates` / `affected` / `skipped`
- Keine `update`/`delete` in der DB bei `dryRun: true`

### 4.3 Apply (nur nach Freigabe)

1. Staging-Dry-Run mit gleicher `organizationId` und Fristen wie Prod
2. Legal-Hold-Inventar prüfen (keine unbeabsichtigten Kandidaten)
3. Downstream-Links (`fines`, `orgInvoices`, `damages`, …) stichprobenartig verifizieren
4. `DOCUMENT_RETENTION_DRY_RUN=false` setzen **oder** `runOnce({ dryRun: false })`
5. Report archivieren (`totals.affected`, `durationMs`)

> **Kein unkontrollierter Global-Apply in Produktion ohne Org-Scope und Dry-Run-Vorlauf.**

---

## 5. Legal Hold

### Setzen

```http
POST /api/v1/vehicles/{vehicleId}/document-extractions/{extractionId}/legal-hold
Content-Type: application/json

{ "reason": "Anwaltsauftrag 2026-07" }
```

### Aufheben

```http
DELETE /api/v1/vehicles/{vehicleId}/document-extractions/{extractionId}/legal-hold
```

Audit: `legal_hold_set` / `legal_hold_clear` in `plausibility.actionAudit`.

---

## 6. Löschstufen

| Stufe | Was wird entfernt | Was bleibt |
|-------|-------------------|------------|
| **Soft delete** | Storage-Objekt, `objectKey`, optional OCR-Cache | DB-Zeile, fachliche Metadaten, bestätigte Downstream-Entities |
| **OCR cache retention** | `_pipeline.contentCache` | Review-Felder, Audit |
| **Sensitive extracted data** | String-Werte in `extractedData` → `[redacted]` | Nicht-String-Felder, Audit |
| **Final row delete** | `vehicle_document_extractions` Zeile | Downstream-Entities (wenn verlinkt → skip) |
| **Rejected cleanup** | REJECTED ohne Datei nach Frist | — |

---

## 7. Mistral-Datenübertragung

Nach OCR schreibt der Processor `lifecycle.mistralTransfer`:

- `status: completed`
- `includesDocumentBytes: true`
- `includesImageBase64: false` (kein Base64-Bild-Upload)
- `model`, `pageCount`, `sentAt`, `completedAt`

Dient Audit/Compliance — keine automatische Löschung bei Mistral-Seite; Retention betrifft lokale Kopien und OCR-Cache.

---

## 8. Backup-Status

Dokument-Objekte unter `LOCAL_DOCUMENT_STORAGE_DIR` sind **nicht** automatisch im VPS Pre-Deploy-DB-Backup enthalten (`DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS=false` default).

| Check | Befehl / Aktion |
|-------|-----------------|
| DB-Backup vor Deploy | `vps-deploy-release.sh` (pg_dump) |
| Objekt-Backup | Manuell/rsync/S3 — separat planen wenn `INCLUDES_OBJECTS=true` |
| Verifikation | `DOCUMENT_STORAGE_BACKUP_LAST_VERIFIED_AT` nach Restore-Test setzen |

---

## 9. Monitoring & Logs

| Signal | Quelle |
|--------|--------|
| Retention-Cron | Log `Document retention cron — dryRun=... affected=...` |
| Soft-Delete-Fehler Storage | `deleteObject(...) failed` Warnung |
| Legal Hold API | `DOCUMENT_LEGAL_HOLD_ACTIVE` (403) |

---

## 10. Troubleshooting

| Symptom | Ursache | Maßnahme |
|---------|---------|----------|
| Datei gelöscht, OCR noch sichtbar | `DOCUMENT_DELETE_STRIP_OCR_CACHE=false` | Flag prüfen; Retention-Phase 1 oder manuell cache strippen |
| Retention löscht nichts | `ENABLED=false` oder `days=0` | Env prüfen |
| Retention zählt aber schreibt nicht | `DRY_RUN=true` | Erwartetes Verhalten bis Apply-Freigabe |
| Zeile bleibt trotz Frist | Legal Hold oder Downstream-Link | `lifecycle.legalHold`, `_count` prüfen |
| Download ohne Audit | Fehlende `userId` | Auth-Context — Vehicle/Org-Download mit eingeloggtem User |

---

## 11. Checkliste vor Prod-Aktivierung

- [ ] Dry-Run pro Pilot-`organizationId` dokumentiert
- [ ] Fristen mit Datenschutz/Legal abgestimmt (`days` > 0 nur bewusst gesetzt)
- [ ] Legal-Hold-Prozess für Support definiert
- [ ] Backup-Strategie für Dokument-Objekte geklärt
- [ ] `DOCUMENT_RETENTION_DRY_RUN=false` nur nach Staging-Apply-Freigabe
