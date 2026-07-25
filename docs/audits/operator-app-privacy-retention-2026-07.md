# Operator App — Datenschutz & Retention (Prompt 34)

| Feld | Wert |
|------|------|
| **Gültig ab** | Backend V4.9.827 |
| **Architektur** | `architecture/OPERATOR_APP_DATA_RETENTION_2026-07-25.md` |
| **Runbook** | `docs/runbooks/operator-data-retention.md` |
| **Master switch** | `OPERATOR_DATA_RETENTION_ENABLED=false` (default) |
| **Dry-run** | `OPERATOR_DATA_RETENTION_DRY_RUN=true` (default) |
| **Scheduler** | `OperatorDataRetentionScheduler` — Cron `0 5 * * *` (05:00 UTC) |

## Leitprinzipien

1. **Keine erfundenen Gesetzesfristen** — alle Tagesfenster default `0` (= deaktiviert) und müssen fachlich/rechtlich pro Mandant bestätigt werden.
2. **Tenant-Scope** — alle Queries und APIs filtern über `organizationId`.
3. **Legal Hold** — `OperatorBookingEvidenceLegalHold` blockiert Draft-Löschung und Signatur-Redaktion pro Buchung; Dokument-Extraktionen nutzen zusätzlich `lifecycle.legalHold` aus Document Intake.
4. **Soft vs. Hard Delete** — Signaturen werden redigiert (Soft); abgebrochene Drafts und verwaiste Operator-Extraktionen werden hard-deleted; OCR-Cache wird aus `plausibility` gestrippt.
5. **Client** — keine dauerhafte lokale Speicherung sensibler Operator-Daten; Signaturen nur im RAM bis Submit/Close.

---

## Datenkategorien-Matrix

| Kategorie | Zweck | Rechtsgrundlagen-Konfig | Speicherdauer | Löschtrigger | Legal Hold | Zugriffskreis | Export | Berichtigung | Löschung | Backup | Orphan Cleanup |
|-----------|-------|-------------------------|---------------|--------------|------------|---------------|--------|--------------|----------|--------|----------------|
| **Handover Drafts** | Zwischenspeicher unvollständiger Übergabe/Abholung (ohne Signaturen) | Org-spezifische Rechtsgrundlage in IAM/DSGVO-Register **zu bestätigen** | TTL: `OPERATOR_HANDOVER_DRAFT_TTL_HOURS` (default 72h); zusätzlich `OPERATOR_RETENTION_ABANDONED_HANDOVER_DRAFT_DAYS` (default 0) | `expiresAt`, stale `updatedAt`, Buchungs-Löschung (CASCADE) | `OperatorBookingEvidenceLegalHold` | Org-Mitglieder mit `bookings.write` | Über Buchungs-/Fahrzeugexport (wenn implementiert) | Draft überschreiben via PUT | Hard delete (Retention/CASCADE) | Postgres VPS-Backup | Retention-Phase `abandoned_handover_draft` |
| **Pickup-/Return-Protokolle** | Vertragliche Fahrzeugübergabe/-rückgabe, Schadens-/Zustandsnachweis | **rechtlich zu bestätigen** (Mietvertrag, Gewährleistung) | Unbegrenzt bis Org-Policy; Signatur-Bitmaps optional via `OPERATOR_RETENTION_HANDOVER_SIGNATURE_BITMAP_DAYS` | Protokoll-Erstellung abgeschlossen; optional Signatur-Redaktion | Booking Legal Hold | `bookings.read` / `bookings.write` | Buchungsdetail, Dokumentenbundle | PATCH über Handover-Service (fachlich eingeschränkt) | CASCADE bei Booking-Löschung; Signatur-Redaktion = Soft | Postgres Backup | N/A (kanonische Records) |
| **Signaturen** | Einwilligung/Nachweis Kunde + Mitarbeiter | **rechtlich zu bestätigen** | In Protokoll bis Redaktionsfrist; Client: nur Session-RAM | Flow-Close (Client), Retention-Redaktion (Server) | Booking Legal Hold | `bookings.write` beim Submit | Nur in Protokoll-PDF/Export | Neues Protokoll (kein nachträgliches Bitmap-Edit) | Client purge; Server null bitmap fields | Postgres Backup | N/A |
| **Schadensbilder** | Schadensdokumentation (`VehicleDamage`) | **rechtlich zu bestätigen** | Folgt Schadens-/Dokument-Retention (nicht Operator-spezifisch) | Schadens-Löschung, Document Intake Lifecycle | Document + Booking Legal Hold | Schadens-Permissions | Fahrzeug-/Schadensexport | Damage CRUD | Hard delete über Damage-Service | Object storage + DB | Document Intake orphan phases |
| **Zustandsbilder** | Zustandsnachweis Handover/Condition | **rechtlich zu bestätigen** | Wie Schadensbilder / Extraktion | Handover submit, Extraction lifecycle | Document + Booking Legal Hold | `bookings.write` | Buchungsbundle | Handover-Update (begrenzt) | Über verknüpfte Entitäten | Wie Dokumente | Document retention |
| **Technische Beobachtungen** | `TechnicalObservations` aus Handover | **rechtlich zu bestätigen** | Kanonisch in `vehicle_complaints` | Resolve/Dismiss/Convert | Kein Operator-Hold (Booking-Hold indirekt) | Vehicle technical-observations API | Fahrzeugexport | CRUD Observation | DELETE Observation | Postgres Backup | N/A |
| **Dokumente** | AI Upload / Booking Documents | Org Legal Doc + Document Intake Policies | `DOCUMENT_RETENTION_*`, `LEGAL_DOCUMENT_RETENTION_*` | Status-basiert (siehe Document Retention) | `lifecycle.legalHold` | Document permissions | DSAR / Bundle | Review vor Apply | Soft/Hard per Document Lifecycle | S3/local + DB | `operator_orphan_extraction` für Operator-Surfaces |
| **OCR-Ergebnisse** | Extraktion in `vehicle_document_extractions` | **rechtlich zu bestätigen** | `OPERATOR_RETENTION_EXTRACTION_OCR_CACHE_DAYS` + globale Document Retention | Soft-delete + Retention | Document legal hold | `document-extractions` permissions | Extraktion-Export | Re-extract / Review | Cache strip / row delete | DB + ggf. Object | `operator_extraction_ocr_cache` |
| **Reifenmessungen** | Operator Tire Measure Flow → Health | **rechtlich zu bestätigen** | Tire health domain retention | Apply/Löschung über Tire-Module | Downstream links block orphan delete | Vehicle intelligence | Fahrzeug-Gesundheit | Korrektur über erneute Messung | Über verknüpfte Records | Postgres Backup | Orphan extraction skip wenn linked |
| **Upload-Metadaten** | `uploadContext` in Extraction pipeline | **rechtlich zu bestätigen** | Mit Extraction row | Orphan/Rejected retention | Document legal hold | Org document inbox | Metadata API | N/A (derived) | Mit Extraction | DB | `operator_orphan_extraction` |
| **Audit Logs** | `ActivityLog` / AuditService | Berechtigtes Interesse / Compliance | IAM/Org Policy (**zu bestätigen**) | IAM retention worker | IAM legal hold | `activity-log` read | IAM DSAR export | Nicht für HTTP auto-audit | IAM deletion | Postgres Backup | N/A |
| **Technische Logs** | App/Worker logs (PM2, Nest Logger) | **zu bestätigen** | Log-Rotation VPS | Ops retention | N/A | Ops only | Nicht user-facing | N/A | Log rotation | VPS logs | N/A |
| **Lokale Client-Daten** | React state, keine Operator-localStorage | Minimierung | Session only | Tab close / flow close | N/A | Gerät des Operators | N/A | State reset | `assertNoOperatorSensitiveLocalStorage` | Kein Backup | N/A |

---

## Implementierte Retention-Mechanismen

| Phase | Beschreibung | Env |
|-------|--------------|-----|
| `abandoned_handover_draft` | Löscht abgelaufene/stale `operator_handover_drafts` | `OPERATOR_RETENTION_ABANDONED_HANDOVER_DRAFT_DAYS`, `OPERATOR_HANDOVER_DRAFT_TTL_HOURS` |
| `handover_signature_bitmap` | Setzt `customerSignatureDataUrl` / `staffSignatureDataUrl` auf `null` | `OPERATOR_RETENTION_HANDOVER_SIGNATURE_BITMAP_DAYS` |
| `operator_orphan_extraction` | Hard-delete REJECTED/FAILED/CANCELLED Operator-Extraktionen ohne Downstream | `OPERATOR_RETENTION_ORPHAN_EXTRACTION_DAYS` |
| `operator_extraction_ocr_cache` | Strip OCR cache aus soft-deleted Operator-Extraktionen | `OPERATOR_RETENTION_EXTRACTION_OCR_CACHE_DAYS` |

## APIs

- `GET /organizations/:orgId/operator/data-retention/config`
- `POST /organizations/:orgId/operator/data-retention/runs` — `{ "dryRun": true }`
- `GET|POST|DELETE /organizations/:orgId/operator/bookings/:bookingId/evidence-legal-hold`
- `GET|PUT|DELETE /organizations/:orgId/operator/bookings/:bookingId/handover-drafts/:kind`

## Offene rechtliche Bestätigungspunkte

1. Aufbewahrungsfrist für abgeschlossene Handover-Protokolle (inkl. Signatur-Bitmaps).
2. Frist für Schadens-/Zustandsbilder im Mietkontext.
3. Ob OCR-Rohdaten nach erfolgreichem Apply gelöscht werden dürfen/müssen.
4. Audit-Log-Aufbewahrung für Operator-Aktionen (Abstimmung mit IAM Retention).
5. DSAR/Export-Umfang für Operator-Evidence pro Buchung.
6. Backup-Wiederherstellung: Re-Hydration gelöschter Signaturen aus Backup verhindern (Prozess).

## Tests

- `backend/src/modules/operator-retention/operator-data-retention.service.spec.ts` — Cleanup, Legal Hold skip, Tenant scope
- `backend/src/modules/operator-retention/operator-evidence-legal-hold.service.spec.ts` — Tenant scope, set/release
- `backend/src/modules/operator-retention/operator-audit-privacy.util.spec.ts` — PII/signature redaction
- `frontend/src/operator/lib/operatorClientPrivacy.test.ts` — Client purge helpers
