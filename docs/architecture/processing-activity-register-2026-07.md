# Processing Activity Register — Art. 30 (Prompt 29)

**Date:** 2026-07-24  
**Version:** V4.9.812  
**Migration:** `20260724090000_processing_activity_register`

## Scope

Technical foundation for a GDPR Art. 30-oriented register (`Verzeichnis der Verarbeitungstätigkeiten`).  
**No automatic claim of legal completeness** — completeness is derived from configured required fields only.

## API

Base path: `/api/v1/organizations/:orgId/data-authorizations/processing-activity-register`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/` | `data_processing.register_view` |
| POST | `/` | `data_processing.register_edit` |
| GET | `/:id` | `data_processing.register_view` |
| PATCH | `/:id` | `data_processing.register_edit` (DRAFT only) |
| GET | `/:id/versions` | `data_processing.register_view` |
| POST | `/exports` | `data_processing.register_export` |
| GET | `/exports/:exportId/download` | `data_processing.register_export` |

### List features

- Server-side cursor pagination (`cursor`, `limit` max 100)
- Filter: `status`, `q` (title/code), `completeness`
- Sort: `title`, `updatedAt`, `nextReviewDate`, `status` + `dir`
- Default: current versions only (`isCurrentVersion=true`)

## Register fields displayed

| Art. 30 element | Source |
|-----------------|--------|
| Name | `title`, `activityCode` |
| Zweck | `purposeSummary` + `purposes[]` |
| Datenkategorien | `dataCategories[]` |
| Verarbeitungsvorgänge | `purposes[]` (technical purpose enum) |
| Betroffene Personen | `dataSubjectTypes[]` |
| Empfänger | `recipientCategoriesSummary` + `dataSharingAuthorizations` |
| Internationale Übermittlungen | sharing auth `transferCountry` / `transferMechanism` |
| Aufbewahrung | `retentionDescription`, `retentionPeriodDays` |
| TOMs | `technicalOrganizationalMeasures` |
| Verantwortlicher | `controllerReference` (org profile ref, no PII dump) |
| Auftragsverarbeiter | `dataProcessingAgreements` |
| Gemeinsame Verantwortung | `jointControllerSummary` |
| Rechtsgrundlage | linked `legalBasisAssessments` |
| DPIA-Status | `dpiaStatus` enum |
| Reviewdatum | `nextReviewDate` + legal basis `reviewDate` |
| Owner | `ownerUserId`, `ownerRole` |
| EnforcementPolicies | linked policies (summary) |
| Runtime Coverage | org enforcement coverage summary |
| Providerzugriffe | grant summary (no tokens/PII) |
| DataSharingAuthorizations | linked authorizations |
| Löschstatus | `deletionStatus` enum |

## Pflichtfelder (completeness)

Evaluated by `ProcessingActivityRegisterCompletenessService`:

| Field key | Blocking? |
|-----------|-----------|
| `title` | no |
| `purposeSummary` | no |
| `dataCategories` | no |
| `processingPurposes` | no |
| `dataSubjectTypes` | no |
| `recipientCategories` | no |
| `internationalTransfers` | no |
| **`retention`** | **yes** |
| `technicalOrganizationalMeasures` | no |
| `controller` | no |
| `processors` | no |
| **`legalBasis`** | **yes** |
| `dpiaStatus` | no |
| `reviewDate` | no |
| `owner` | no |

## Vollständigkeitsstatus

| Status | Meaning |
|--------|---------|
| `INCOMPLETE` | Blocking gaps (legal basis or retention) or <60% fields |
| `PARTIALLY_COMPLETE` | No blocking gaps, ≥60% fields |
| `COMPLETE_FOR_TECHNICAL_SCOPE` | All tracked fields present — **not legal certification** |

Response includes per-field `fields[]` with `present`, `blocking`, `label`, optional `detail`.

## Exporte

- Formats: **CSV**, **PDF**
- Permission: `data_processing.register_export` only
- Metadata: `dataSnapshotAt`, `recordVersion`, `checksumSha256`, `expiresAt` (default 72h)
- Files stored under `uploads/processing-activity-register/<orgId>/` (tenant-scoped)
- Append-only audit: `EXPORT_CREATED`, `EXPORT_DOWNLOADED`
- Purge scheduler removes expired export records (`DATA_AUTH_REGISTER_EXPORT_PURGE_MS`)

Exports include disclaimer and snapshot timestamp — no cross-tenant reports.

## Berechtigungen

| Permission | Level |
|------------|-------|
| `data_processing.register_view` | read |
| `data_processing.register_edit` | write |
| `data_processing.register_export` | manage |

## Audit

Append-only table: `processing_activity_register_audit_events`  
Actions: `VIEW_LIST`, `VIEW_DETAIL`, `UPDATE`, `EXPORT_CREATED`, `EXPORT_DOWNLOADED`

## Versionierung

- Uses existing `policyFamilyId` + `versionNumber` architecture
- `GET /:id/versions` lists lineage
- Edits only on `DRAFT` status (immutable after activation)

## Test results

```
npm run test:data-auth:register
→ 1 suite, 6 tests passing
```
