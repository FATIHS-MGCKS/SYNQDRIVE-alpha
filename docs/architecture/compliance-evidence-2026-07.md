# Compliance Evidence & Auditable Reports (Prompt 33)

**Date:** 2026-07-24  
**Version:** V4.9.816  
**Migration:** `20260724130000_compliance_evidence`

## Scope

Internal privacy and ISO audit evidence layer assembling immutable version references across Data Authorization domains.  
**No automatic compliance claim** — reports explicitly flag gaps and set `complianceClaimAllowed: false` when mandatory data is missing.

## Report types (`ComplianceEvidenceReportType`)

| Type | Evidence domain |
|------|-----------------|
| `FULL_PACKAGE` | All sections below |
| `PROCESSING_ACTIVITY_VERSION` | Versioned processing activities |
| `LEGAL_BASIS` | Legal basis assessments |
| `CONSENT` | Data subject consents |
| `PROVIDER_ACCESS_GRANT` | Provider grants |
| `DATA_PROCESSING_AGREEMENT` | DPA/AVV records |
| `DPIA` | DPIA records |
| `ENFORCEMENT_COVERAGE` | Enforcement coverage registry |
| `REVIEW_APPROVAL` | Review workflow decisions |
| `POLICY_DEPLOYMENT` | Lifecycle activation events |
| `REVOCATION` | Revocation workflows |
| `RETENTION` | Retention policies |
| `DELETION` | Deletion jobs + governance decisions |
| `AUTHORIZATION_DECISIONS` | Runtime authorization audit |
| `RUNTIME_HEALTH` | Enforcement runtime metrics |
| `PROVIDER_CONSISTENCY` | Grant vs DPA alignment |

## Data sources

| Section | Prisma / service source | Immutable refs |
|---------|-------------------------|----------------|
| Processing activity | `ProcessingActivity` | `policyFamilyId`, `versionNumber`, `contentFingerprint` |
| Legal basis | `LegalBasisAssessment` | `policyFamilyId`, `versionNumber`, `status` |
| Consent | `DataSubjectConsent` | `id`, `status`, `evidenceReference` |
| Provider grant | `ProviderAccessGrant` | `id`, `provider`, `providerStatus` |
| DPA | `DataProcessingAgreement` | `policyFamilyId`, `versionNumber` |
| DPIA | `ProcessingActivityDpia` | `id`, `approvalStatus`, `contentFingerprint` |
| Enforcement | `EnforcementCoverageRegistryService` | `coverageVersion`, `gitCommit` |
| Review | `DataProcessingReviewDecision` | `entityVersionNumber`, `decision` |
| Policy deployment | `ProcessingActivityLifecycleEvent` | `newStatus`, `eventType` |
| Revocation | `DataAuthorizationRevocationWorkflow` | `id`, `status` |
| Retention | `ProcessingActivityRetentionPolicy` | `id`, `retentionClass` |
| Deletion | Jobs + `ProcessingActivityDeletionDecision` | job/decision ids |
| Authorization | `AuthorizationDecisionEvent` | hashes only — no raw PII |
| Runtime health | Coverage metrics snapshot | domain keys |
| Provider consistency | Grants vs DPAs | processor name match |

Historical governance decisions are **never rewritten** — evidence reads append-only tables and versioned records.

## Integrity procedure

1. **Canonical JSON** package assembled at snapshot time
2. **SHA-256 checksum** (`checksumSha256`) stored on `ComplianceEvidenceReport`
3. **Download verification** — checksum recomputed before streaming file
4. **Provenance** — when runtime data included: `gitCommit`, `buildVersion`, `provenanceLabel`
5. **Idempotency key** — SHA-256 of org + report type + period + record version (reproducible request identity)
6. **Gap labeling** — per-section `hasGap` + `gapReason`; package-level `complianceClaimAllowed`

Mandatory sections for `FULL_PACKAGE` compliance claim:

- `PROCESSING_ACTIVITY_VERSION`
- `LEGAL_BASIS`
- `ENFORCEMENT_COVERAGE`
- `REVIEW_APPROVAL`
- `RETENTION`

## Storage & download concept

| Aspect | Implementation |
|--------|----------------|
| Storage | Private filesystem `uploads/compliance-evidence/{orgId}/{reportId}-*.json` — **no public URLs** |
| TTL | 72h (`expiresAt`) — purge scheduler |
| Download | Auth-gated `GET .../exports/:reportId/download` → `StreamableFile` |
| Secrets | No cross-system secrets in package |
| Sensitive data | Minimized — version refs, counts, hashes; no document contents |
| Async | Reports with `async: true` or row estimate > 500 → `PLANNED` → scheduler processes |
| Audit | `ComplianceEvidenceReportAuditEvent`: REQUESTED, COMPLETED, FAILED, DOWNLOADED |

## API

Base: `/organizations/:orgId/data-authorizations/compliance-evidence`

| Permission | Endpoints |
|------------|-----------|
| `data_processing.evidence_view` | config, reports, audit-events, preview |
| `data_processing.evidence_export` | POST exports, GET download |

## Test results

```bash
cd backend && npm run test:data-auth:evidence
```

| Scenario | Status |
|----------|--------|
| Full package assembly | ✅ |
| Immutable version refs | ✅ |
| Gap labeling / no false compliance claim | ✅ |
| Export checksum + audit | ✅ |
| Idempotent export replay | ✅ |
| Wrong tenant download blocked | ✅ |
| Reproducible idempotency key | ✅ |
| Provider consistency gaps | ✅ |

## Disclaimer

Compliance evidence reports are technical audit artifacts for internal review. They do **not** constitute legal or ISO certification.
