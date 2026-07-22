# Legal Documents — Post-Remediation Production Readiness Audit (Prompt 32/32)

**Date:** 2026-07-22  
**Scope:** Verwaltung → Kunden-Rechtstexte (full remediation series, Prompts 1–31)  
**Method:** Independent code/schema/test verification; no new product features  
**Auditor:** Cursor Cloud Agent (final gate)

---

## Executive Summary

After 31 remediation prompts, the **Kunden-Rechtstexte** domain has a mature architecture: lifecycle states, append-only audit events, central resolver, private object storage, malware scanning, integrity/reconciliation, bundle pointers (incl. privacy), rental-contract snapshots, delivery evidence, pickup gate, retention/legal hold, permissions, i18n/a11y, notifications, and dedicated CI/E2E gates.

**Decision: NO-GO for production release** on the audited commit.

Primary blockers are **repository build failures** (`nest build` / deploy path) and **delivery-evidence trust boundaries** that still accept client-supplied legal metadata and delivery status. Four-eyes enforcement silently no-ops when the authenticated actor is missing. Migration and PostgreSQL invariant tests could not be executed in the audit environment (no local PostgreSQL); they must pass in CI before release.

Cosmetic UI/i18n progress must not be mistaken for legal/compliance readiness while evidence integrity and deploy gates remain open.

---

## Geprüfter Git-Stand

| Field | Value |
|-------|-------|
| **Commit** | `37636e5f1ed258c66fa5654e0e6422c7ee75a0f9` |
| **Message** | `feat(legal-docs): add E2E specs, CI gates, and migration tests (Prompt 31)` |
| **Branch** | `cursor/legal-docs-e2e-ci-28ca` |
| **PR** | [#667](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/667) (draft) |
| **Baseline audit** | `docs/audits/legal-documents-remediation-baseline-2026-07.md` (Prompt 1) |
| **Area audits** | 29 domain audits under `docs/audits/legal-documents-*.md` |

---

## Bestätigte Fixes (Remediation vs. Baseline Prompt 1)

| Area | Baseline gap | Verified fix |
|------|--------------|--------------|
| **PRIVACY_POLICY** | Missing in bundle/completeness | Bundle pointers, completeness, notifications wired (Prompts 10–12) |
| **Sprache / Jurisdiktion** | Hardcoded `de` everywhere | Central `LegalDocumentResolverService` with explicit fallback decisions (Prompt 8); residual `de` in some paths (see P2) |
| **B2B/B2C / scope** | No application scope | `LegalDocumentScopeService`, station/B2B filters (Prompt 9) |
| **Single-ACTIVE** | No DB invariant | Migration `20260722110000` + transactional activate + 409 conflict (Prompt 3) |
| **Lifecycle** | Upload → activate only | Full workflow: review, approve, schedule, revoke, archive + events (Prompts 4–5) |
| **Append-only audit** | No event log | `OrganizationLegalDocumentEvent` + immutable append (Prompt 5) |
| **Permissions** | Role-only | Granular `legal_documents.*` permissions + guard (Prompt 14) |
| **Vier-Augen** | None | `LegalDocumentFourEyesService` + org flag (Prompt 14); bypass gap remains (P1) |
| **PDF security** | No validation | `LegalDocumentPdfValidationService` (Prompt 11) |
| **Malware scan** | None | ClamAV/dev/unavailable adapters; prod config validator blocks noop (Prompt 12) |
| **Private storage** | Local only | S3 private adapter + startup validator; no public URLs (Prompt 13) |
| **Checksums** | Write-only | Verify-on-download + integrity persistence (Prompt 13) |
| **Storage reconciliation** | None | Reconciliation runs + alerts (Prompt 13) |
| **Bundle pointers** | AGB/Widerruf only | Terms, consumer info, privacy pointers frozen on bundle (Prompt 10) |
| **Rental snapshots** | Mutable / ambiguous | `RentalContractLegalSnapshotService` — explicit IDs, no `findFirst` pick (Prompt 16) |
| **Delivery evidence** | None | `LegalDocumentDeliveryEvidence` model + API (Prompt 18); trust gaps (P1) |
| **Pickup gate** | Display-only completeness | `BookingPickupGateService` server-side gate + overrides (Prompt 20) |
| **Email delivery** | Ad-hoc | Idempotent send + webhook status sync + evidence link (Prompt 21) |
| **Retention / legal hold** | None | Phased purge + hold guards (Prompt 22) |
| **UI/UX** | Legacy tab | Wizard, lifecycle dialogs, version history, IA (Prompts 23–26) |
| **A11y / i18n** | German-only UI strings | WCAG patterns + DE/EN keys (Prompts 27–28) |
| **Notifications** | Fragmented | Central operational notification matrix (Prompt 29) |
| **Tests / CI** | Sparse | 358 unit + 22 security + 25 integration + 16 E2E + workflow (Prompts 30–31) |

---

## Verbleibende Findings

### P0 — Release blockers (deploy / integrity)

| ID | Finding | Impact | Affected files |
|----|---------|--------|----------------|
| **P0-1** | `nest build` fails: `LegalDocumentsService` referenced in `documents.module.ts` providers/exports **without import** | Production deploy / PM2 restart cannot compile | `backend/src/modules/documents/documents.module.ts` |
| **P0-2** | `nest build` fails: `VoiceAssistantModule` and `DeviceConnectionWebhookProcessor` undefined in `workers.module.ts` | Same — blocks entire backend build (not legal-docs-specific but blocks release train) | `backend/src/workers/workers.module.ts` |

### P1 — Production blockers (legal-docs domain)

| ID | Finding | Impact | Affected files |
|----|---------|--------|----------------|
| **P1-1** | **Client-trusted delivery evidence metadata:** `recordPresentation` persists `versionLabel`, `checksum`, `language`, `documentType` from request body; `assertDocumentScope` validates ID linkage only, not metadata against DB/generated document | Forged or mismatched legal version proof; audit trail not cryptographically tied to served document | `legal-document-delivery-evidence.service.ts`, `legal-document-delivery-evidence.controller.ts`, `dto/legal-document-delivery-evidence.dto.ts` |
| **P1-2** | **Client can set `deliveryStatus` on create**, including skip to `DELIVERED` (`deliveryStatus ?? initialStatusForChannel`) | False delivery proof without email/webhook path | Same as P1-1 |
| **P1-3** | **Four-eyes silent bypass:** `if (!actorUserId) return;` in `assertSeparation` | When four-eyes enabled, missing actor bypasses maker-checker instead of fail-closed | `legal-document-four-eyes.service.ts:34` |
| **P1-4** | **Delivery evidence write endpoints** use `@Roles('ORG_ADMIN','MASTER_ADMIN')` only on POST/PATCH; GET routes have `@RequireLegalDocumentPermission('legal_documents.audit_view')` but mutations do not align with permission matrix | Over-broad role access vs. configured `legal_documents.*` grants | `legal-document-delivery-evidence.controller.ts` |
| **P1-5** | **Migration + PG invariant tests not executed** in audit environment (PostgreSQL unreachable locally) | Critical migrations (`20260722100000`–`20260722250000`) and 7 PG invariants unverified on this agent run; release depends on CI green | `scripts/test/legal-documents-migration-test.sh`, `testing/legal-documents-postgres.invariants.integration.spec.ts`, `.github/workflows/legal-documents-production-readiness.yml` |

### P2 — Should fix before broad production; compensating controls possible short-term

| ID | Finding | Notes | Affected files |
|----|---------|-------|----------------|
| **P2-1** | `booking-document-completeness.service.ts` still calls `getActiveByType(orgId, 'de')` while resolver handles language | German-only org readiness path; inconsistent with resolver for non-`de` tenants | `booking-document-completeness.service.ts:70` |
| **P2-2** | Fire-and-forget side effects (`void …catch(() => {})`) for notifications, integrity, bundle tasks | Failures may be silent; ops depends on monitoring/alerts | `booking-document-bundle.service.ts`, `legal-documents.service.ts`, `booking-document-bundle-monitoring.service.ts` |
| **P2-3** | PostgreSQL invariant suite gated (`LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1`); skipped in default `test:legal-documents` | Local dev can miss DB-level regressions | `testing/legal-documents-postgres.invariants.integration.spec.ts` |
| **P2-4** | Some Prisma `update`/`findFirst` use `{ id }` without `organizationId` in `where` (tenant enforced upstream) | Defense-in-depth gap if service called with wrong context | Multiple document services |
| **P2-5** | Playwright E2E previously flaky (retry passed in prior run; stable in this audit run) | CI noise / false confidence risk | `frontend/e2e/legal-documents-flow.spec.ts` |

### P3 — Technical debt / polish

| ID | Finding | Notes |
|----|---------|-------|
| **P3-1** | Hardcoded German in backend email templates / operational copy | UI i18n complete; server templates partially DE |
| **P3-2** | Prisma warning: `onDelete: SetNull` on required relation field | Schema hygiene; not legal-docs-specific |
| **P3-3** | `LegalDocumentDevelopmentMalwareScannerAdapter` exists | Blocked in production by config validator — acceptable if prod env validated at startup |

---

## Auditbereich-Matrix (Kurzbewertung)

| Bereich | Status | Notes |
|---------|--------|-------|
| Datenmodell & Migrationen | ⚠️ | 13 legal migrations present; not executed locally |
| Single-ACTIVE-Invariante | ✅ | Partial unique index + repair log + 409 handling |
| Dokumenten-Lifecycle | ✅ | States, transitions, events tested |
| Append-only Audit | ✅ | Events immutable; security tests |
| Berechtigungen | ⚠️ | Granular permissions; delivery writes misaligned (P1-4) |
| Vier-Augen | ⚠️ | Implemented; null-actor bypass (P1-3) |
| Zentraler Resolver | ✅ | Engine + conflict surfacing |
| Sprache / Jurisdiktion | ⚠️ | Resolver OK; completeness still `de` (P2-1) |
| B2B/B2C | ✅ | Scope service + resolver context |
| PDF-Sicherheit | ✅ | Validation service + negative tests |
| Malware-Scan | ✅ | Prod guard rejects dev/noop |
| Privater Object Storage | ✅ | S3 private; no public URLs found |
| Prüfsummen | ✅ | SHA-256 + verify-on-download |
| Storage-Reconciliation | ✅ | Service + scheduler + alerts |
| Bundle-Pointer | ✅ | Terms, consumer, privacy frozen |
| Datenschutzhinweise | ✅ | Privacy pointer on bundle |
| Bundle-Vollständigkeit | ✅ | Resolver-driven completeness |
| Mietvertragssnapshots | ✅ | Immutable snapshot IDs |
| Zustell-/Kenntnisnachweis | ⚠️ | Model exists; client trust (P1-1/2) |
| Pickup-Gate | ✅ | Integration + security tests |
| Overrides | ✅ | Permission + reason + audit |
| Queue & Idempotenz | ✅ | `requestId` dedup on evidence; email send keys |
| E-Mail-Versand | ✅ | Frozen pointers + webhook sync |
| Retention | ✅ | Phased purge + legal hold |
| Legal Hold | ✅ | Blocks purge with active references |
| UI/UX | ✅ | Wizard, lifecycle, history |
| Mobile | ✅ | 320px E2E pass |
| Accessibility | ✅ | axe 5/5 pass |
| i18n | ✅ | DE/EN keys; backend templates partial |
| Notifications | ✅ | Central matrix |
| Monitoring | ✅ | Bundle monitoring + integrity alerts |
| Backend-Tests | ✅ | 358+22+25 pass (this run) |
| Frontend E2E | ✅ | 9+2+5 pass (this run) |
| CI | ⚠️ | Workflow defined; green not verified here |
| Betriebsdokumentation | ✅ | Runbooks + architecture records |

---

## Test- und Buildresultate (Audit-Lauf 2026-07-22)

| Suite | Command | Result |
|-------|---------|--------|
| Backend unit (legal-docs) | `npx jest --testPathPattern=legal-document\|…` (46 suites) | **358 PASS** |
| Backend security negatives | `legal-documents-security-negative` | **22 PASS** |
| Backend integration | activation, lifecycle-events, delivery-evidence, pickup-gate | **25 PASS** |
| Frontend vitest | `npm run test:legal-documents` | **60 PASS** |
| Playwright E2E desktop | `legal-documents-flow.spec.ts` | **9 PASS** |
| Playwright mobile | `legal-documents-responsive.spec.ts` | **2 PASS** |
| Playwright a11y | `legal-documents-a11y.spec.ts` | **5 PASS** |
| Frontend production build | `npm run build` | **PASS** |
| Backend `nest build` | `npm run build` | **FAIL** (4 TS errors: P0-1, P0-2) |
| Prisma validate | `npm run prisma:validate` | **PASS** (SetNull warning) |
| Migration tests (empty + legacy) | `legal-documents-migration-test.sh all` | **SKIPPED** — PostgreSQL not reachable |
| PG invariants | `LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1` | **NOT RUN** — no DB |

---

## Datenmigrationsstatus

| Migration | Purpose |
|-----------|---------|
| `20260722100000_legal_document_privacy_pointers` | Privacy bundle pointer |
| `20260722110000_legal_document_single_active_invariant` | Partial unique ACTIVE + repair log |
| `20260722120000_legal_document_lifecycle` | Lifecycle columns/statuses |
| `20260722130000_legal_document_lifecycle_events` | Append-only events |
| `20260722140000_legal_document_consumer_information` | Consumer information type |
| `20260722150000_legal_document_application_scope` | Station/B2B scope |
| `20260722160000_legal_document_permissions` | Permission seeds |
| `20260722170000_legal_document_pdf_validation` | PDF metadata |
| `20260722180000_legal_document_malware_scanner` | Scan status fields |
| `20260722190000_legal_document_storage_integrity` | Integrity + reconciliation |
| `20260722200000_rental_contract_legal_snapshot` | Snapshot pointers |
| `20260722210000_legal_document_delivery_evidence` | Delivery evidence table |
| `20260722250000_legal_document_retention_legal_hold` | Retention + hold |

**Status:** Schema valid; migrations **not applied/tested** in this environment. CI job `migration-tests` and `backend-integration` (with `prisma migrate deploy` + `test:legal-documents:postgres`) are the release gate.

---

## Betriebsanforderungen (Production)

| Requirement | Variable / check |
|-------------|------------------|
| Private document storage | `DOCUMENT_STORAGE_PROVIDER=s3`, bucket + credentials |
| No local storage in prod | Startup validator; `DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` must stay false |
| Malware scanner | `LEGAL_MALWARE_SCANNER_PROVIDER=clamav` (not `development` / `unavailable`) |
| ClamAV reachable | Health endpoint / startup probe |
| Redis + workers | Email delivery, reconciliation, retention schedulers |
| Resend webhooks | Delivery status transitions for email evidence |
| Legal hold / retention policy | Org-level policy JSON before purge jobs |
| Monitoring | Integrity alerts, bundle monitoring, operational notifications |
| CI green | `legal-documents-production-readiness.yml` on merge commit |

---

## DSGVO- und ISO-Kontrollmatrix (Auszug)

| Control | Requirement | Status | Gap |
|---------|-------------|--------|-----|
| **Art. 5(1)(f) Integrity** | Tamper-evident legal proofs | ⚠️ | Client-supplied checksum/version on evidence (P1-1) |
| **Art. 5(2) Accountability** | Demonstrable controls | ✅ | Audit events, retention, legal hold |
| **Art. 17 Erasure** | Retention + hold guards | ✅ | Phased purge with reference checks |
| **Art. 30 Records** | Processing documentation | ✅ | Architecture + audit docs |
| **Art. 32 Security** | Encryption, access control | ⚠️ | Private storage OK; build broken (P0) |
| **ISO 27001 A.8.2** | Classification / handling | ✅ | Legal docs segregated module |
| **ISO 27001 A.8.24** | Cryptography | ✅ | SHA-256, SSE on S3 |
| **ISO 27001 A.8.28** | Secure coding | ⚠️ | Trust boundary on evidence API |
| **ISO 27001 A.12.1** | Change management | ⚠️ | CI exists; build red on commit |
| **ISO 27001 A.12.4** | Logging | ✅ | Append-only events; pickup gate audit |

---

## Go / No-Go Entscheidung

### **NO-GO**

Production release of **Kunden-Rechtstexte** must not proceed on commit `37636e5f` until P0 and P1 items are resolved and verified.

---

## Bedingungen für Production-Freigabe

1. **`nest build` green** on release commit (fix P0-1, P0-2).
2. **Delivery evidence server-side derivation:** populate `versionLabel`, `checksum`, `language`, `documentType` from `generatedDocument` / `organizationLegalDocument`; reject client overrides; never accept `DELIVERED` on POST.
3. **Four-eyes fail-closed** when enabled and `actorUserId` is absent.
4. **Align delivery evidence mutations** with `@RequireLegalDocumentPermission` (e.g. `audit_view` or dedicated write permission).
5. **CI workflow green** including migration-tests (empty + legacy) and `test:legal-documents:postgres`.
6. **Production env validation** passes: S3 private storage + ClamAV (no dev adapters).
7. **Staged deploy smoke:** upload → approve → activate → booking bundle → pickup gate block/override → evidence row immutability.

---

## Erforderliche juristische Freigabepunkte

| # | Topic | Owner |
|---|-------|-------|
| J-1 | Wording of AGB, Widerrufsbelehrung, Verbraucherinformation, Datenschutzhinweis templates | Legal / tenant |
| J-2 | Acknowledgment vs. consent distinction in checkout and pickup flows | Legal + Product |
| J-3 | Retention periods per document class vs. `OrganizationLegalDocumentRetentionPolicy` | Legal + DPO |
| J-4 | Override policy for pickup gate soft blocks (`legal_documents.override_handover`) | Legal + Ops |
| J-5 | Cross-border B2B/B2C scope rules per jurisdiction | Legal |
| J-6 | Evidence admissibility: server-derived checksums and delivery chain | Legal |

---

## Bekannte Restrisiken (nach Freigabe-Bedingungen)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Multi-language tenants with `de` completeness shortcut | Medium | P2-1 fix + resolver-only path |
| Silent async notification failures | Low–Medium | Alerting on `LEGAL_*` ops notifications |
| E2E mock-based (no live DIMO/email) | Low | Staging integration tests |
| Juristische Texte tenant-supplied | Inherent | Versioning + immutability after activate |
| Operator override at pickup | Medium | Audit + permission + reason mandatory |

---

## Rollback- und Recovery-Bereitschaft

| Scenario | Procedure |
|----------|-----------|
| Bad migration | Restore DB backup (VPS deploy script pre-migrate backup); repair log for single-ACTIVE documents |
| Wrong active version | Activate previous ARCHIVED version via admin UI; bundle regen for open bookings |
| Integrity mismatch | `LegalDocumentStorageReconciliationService` run + ops runbook |
| Legal hold accidental | `POST …/legal-hold` release with audit |
| Deploy rollback | PM2 previous release symlink (`vps-deploy-release.sh` retention) |
| Evidence corruption | Rows immutable after terminal status — legal review; do not DELETE without hold process |

**Docs:** `docs/runbooks/legal-document-retention.md`, `architecture/LEGAL_DOCUMENT_*_2026-07-22.md`

---

## Gezielte Code-Review-Hinweise (Anti-Patterns)

| Pattern | Found? | Location |
|---------|--------|----------|
| Stille `return`-Pfade | Yes | `four-eyes.service.ts:34` |
| `findFirst` bei eindeutigen Daten | Mitigated in snapshots; elsewhere tenant-scoped | `rental-contract-legal-snapshot.service.ts` documents avoidance |
| Fire-and-forget | Yes | Bundle/notification paths (P2-2) |
| Client-vertraute Actor-Felder | Mitigated on pickup gate; **not** on evidence metadata | Pickup gate vs delivery evidence |
| Fehlende Tenant-Filter | Mostly OK; defense-in-depth gaps | P2-4 |
| Öffentliche Storage-URLs | **Not found** | Private stream downloads only |
| Hardcodiertes Deutsch | Partial | P2-1, P3-1 |
| Ungetestete Migrationen | **In this env** | P1-5 |
| Inkonsistente Statusableitung | Partial | Completeness vs resolver language |
| No-op Security-Adapter in Prod | **Blocked by validator** | `legal-document-malware-scanner.config-validator.ts` |
| Übersprungene kritische Tests | PG invariants gated only | P2-3 |

---

## Referenzen

- Baseline: `docs/audits/legal-documents-remediation-baseline-2026-07.md`
- CI coverage: `docs/testing/legal-documents-ci-e2e-coverage.md`
- Workflow: `.github/workflows/legal-documents-production-readiness.yml`
- Architecture index: `frontend/src/master/components/ArchitekturView.tsx` (Legal Documents V4.9.759–770)

---

*End of audit — Prompt 32/32*
