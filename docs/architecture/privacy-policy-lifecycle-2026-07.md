# Versioned Policy Lifecycle (Prompt 11)

**Date:** 2026-07-23  
**Migration:** `20260724020000_privacy_policy_lifecycle`

## Scope

Unified lifecycle for:

- `ProcessingActivity`
- `LegalBasisAssessment`
- `EnforcementPolicy`

Shared enum: `PrivacyPolicyLifecycleStatus`

## Status matrix

| From \\ To | IN_REVIEW | APPROVED | REJECTED | SCHEDULED | ACTIVE | SUSPENDED | SUPERSEDED | REVOKED | EXPIRED |
|------------|-----------|----------|----------|-----------|--------|-----------|------------|---------|---------|
| DRAFT | ✓ | — | — | — | **✗** | — | — | — | — |
| IN_REVIEW | — | ✓ | ✓ | — | — | — | — | — | — |
| APPROVED | — | — | — | ✓ | ✓ | — | ✓* | — | — |
| SCHEDULED | — | ✓ | — | — | ✓ | — | ✓* | — | — |
| ACTIVE | — | — | — | — | — | ✓ | ✓* | ✓ | ✓ |
| SUSPENDED | — | — | — | — | ✓ | — | — | — | ✓ |
| REJECTED | — | — | — | — | **✗** | — | — | — | — |
| REVOKED | — | — | — | — | **✗** | — | — | — | — |
| SUPERSEDED / EXPIRED | — | — | — | — | **✗** | — | — | — | — |

\* System-driven during activation of a successor version (`supersededById` required).

### Semantic separation

| Status | Meaning |
|--------|---------|
| **REJECTED** | Governance rejection during review — never operational |
| **REVOKED** | Explicit withdrawal of an operational policy — terminal, not reactivatable |
| **SUSPENDED** | Controlled pause — reversible to ACTIVE (e.g. consent withdrawal → enforcement suspend) |
| **SUPERSEDED** | Replaced by a newer version — references `supersededById` |
| **EXPIRED** | Validity window ended — not usable |

## Database invariants

1. **Partial unique index** — at most one `ACTIVE` row per `policy_family_id` per entity table.
2. **Version uniqueness** — `(policy_family_id, version_number)` unique on all versioned entities.
3. **Processing activity code** — `(organization_id, activity_code, version_number)` unique.
4. **Append-only lifecycle events** — `*_lifecycle_events` tables; no UPDATE/DELETE in services.
5. **Immutability** — terminal/operational rows not editable; material changes → new version.

## Conflict behavior (HTTP 409)

Concurrent activation races on partial unique index (`P2002`) → `POLICY_ACTIVE_CONFLICT`.

Idempotent activation of sole ACTIVE version returns unchanged row.

Scheduled activation respects `validFrom` when status = SCHEDULED.

## Versioning

| Field | Purpose |
|-------|---------|
| `policyFamilyId` | Stable lineage across versions |
| `versionNumber` | Monotonic per family |
| `isCurrentVersion` | Latest working version marker |
| `supersededById` | Successor reference on SUPERSEDED |

## Test results

```
npm test -- --testPathPattern="data-authorizations/privacy-domain"
→ 17 suites, 92 tests passing
```

## Migration mapping

| Entity | Old | New |
|--------|-----|-----|
| ProcessingActivity | ARCHIVED | SUPERSEDED |
| LegalBasisAssessment | UNDER_REVIEW | IN_REVIEW |
| LegalBasisAssessment | APPROVED | ACTIVE |
| EnforcementPolicy | DISABLED | SUSPENDED |
