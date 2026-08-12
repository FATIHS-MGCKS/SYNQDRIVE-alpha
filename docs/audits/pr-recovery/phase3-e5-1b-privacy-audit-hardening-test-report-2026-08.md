# Phase 3 — E5.1B Privacy & Audit Hardening — Test Report (2026-08)

Branch: `integration/evaluations-e5-quality-privacy-authorization-audit-2026-08`
Draft PR: #1025
Precondition: `E5_1A_COMPLETED` (verified — E5.1A commit is an ancestor of the PR head).

## 0. State verification

| Ref | SHA |
|-----|-----|
| PRE_E5_1B_HEAD (local = remote = PR head) | `0308aa48b7effc97d984e2b1f996d7a19b85e420` |
| current main | `960365a9b095a54f4656947ac2067a104e56bd8a` |
| E5.1A ancestor check | PASS (`61cf4094` is ancestor of PR head) |

TESTED_CODE_SHA: recorded in the follow-up commit on this branch (this report is committed together with the code; the pushed head is the tested SHA).

## 1. Scope

Correct only the four E5A/E5B defects:
1. reversible/leaky pseudonymization,
2. unproven person-level permission mapping,
3. audit durability ambiguity,
4. insufficient real DB/security evidence.

No new branch/PR, no merge, no Ready.

## 2. Pseudonymization — reversible/leaky → keyed HMAC

Old form appended a fragment of the original id (`person-····<slice>`), which leaked source-id characters.

New canonical implementation (`evaluations-privacy.policy.ts`):
- HMAC-SHA-256 keyed by a dedicated server secret,
- domain-separated input `evaluations-person-v1|organizationId|personId`,
- output `person-v1-<16 hex of digest>` — digest hex only, no original-id substring,
- versioned (`v1`),
- stable for same tenant+person+version, different for different persons, and different for the same person id across tenants (organizationId is part of the domain-separated input),
- non-reversible without the key; the key is never exposed and there is no reverse-lookup API.

Secret: `EVALUATIONS_PSEUDONYM_SECRET` (documented in `backend/.env.example`). A dev-only fallback keeps local tests deterministic; production MUST set the secret. Not deployed to production in this task.

### Canonical-authority search (Step 3/4)

The only existing pseudonymization utility is IAM data-retention `pseudonymizeValue(value, salt)` (`iam-data-retention.policy.ts`). It was evaluated and rejected for reuse because it:
- uses non-keyed salted SHA-256 (`salt:value`), which the E5.1B brief explicitly discourages ("never plain SHA-256 of guessable IDs"; prefer keyed PRF/HMAC),
- omits tenant domain separation, so the same person id would collide across tenants (violates the required cross-tenant property),
- serves a different purpose (irreversible retention destruction of stored PII, not analytics field-level exposure).

Therefore a dedicated keyed HMAC was implemented. This is not a redundant parallel crypto for the same purpose; it is a distinct, correctly-scoped construction.

## 3. Permission authority — unproven mapping → proven authorities

Old E5B mapped `invoices.read` → pseudonymous and invoices+customers → full. `invoices.read` does not prove authority to view person-level Driver Analytics.

Corrected mapping (`resolveEvaluationsPiiTier`, fail-closed):
- MASTER_ADMIN / ORG_ADMIN → `full` (canonical admin authority),
- `customers.read` (person-identity authority) → `full`,
- `evaluations.read` (analytics authority) → `pseudonymous`,
- otherwise → `none`.

`invoices.read` alone grants nothing person-level. No new broad permission was invented; both `customers` and `evaluations` are existing canonical permission modules evaluated via `permission.util`. See `phase3-e5-person-level-permission-authority-matrix-2026-08.csv`.

## 4. Audit durability — contradiction resolved

Previously every access was claimed audited, but runtime allowed audit enqueue failure and still returned sensitive data.

Resolution: person-level disclosure is treated as audit-critical. On a successful disclosure with factors, the canonical `BusinessAuditService.enqueue` + `flushCritical([id])` must durably persist the record BEFORE the data is released. If durable persistence fails (`ServiceUnavailableException`), the service fails closed — returns UNAVAILABLE (`reason = SENSITIVE_AUDIT_UNAVAILABLE`) with no factors, never a mere warning.

- Denied access remains DENIED regardless of audit subsystem health (best-effort denied record; audit failure never grants access).
- Authorized access with no disclosed person data uses best-effort audit only (no fail-closed on an empty result).
- Actor identity always comes from the resolved server context (`actor.id`); no caller-supplied actor id is accepted.
- Audit metadata is non-PII only: org, actor, action, entityType, scope token, piiTier, stationScoped, factorCount, calculationVersion, correlationId. No driver id, pseudonym, name, email, or payload.

## 5. Tests

### Unit (mocked)
- `evaluations-privacy.policy.spec.ts` — tier mapping (customers.read→full, evaluations.read→pseudonymous, unrelated→none) + keyed pseudonym properties (stable, per-person, cross-tenant-distinct, keyed, no fragment, versioned).
- `evaluations-audit.service.spec.ts` — DENIED/SUCCEEDED taxonomy, non-PII metadata, unique idempotency, best-effort enqueue, durable-critical flush of enqueued id, and flush-failure propagation.
- `evaluations-insights.service.spec.ts` — full/pseudonymous/none gating, durable-critical disclosure path, and fail-closed on durable audit failure.

Result: 38 passed (privacy + audit + e4 insights suites).

### Real PostgreSQL adversarial (env-gated `EVALUATIONS_E4_POSTGRES_INTEGRATION=1`)
`evaluations-insights.privacy-audit.integration.spec.ts` — 8 tests, all pass against a live PostgreSQL cluster:
1. ORG_A membership cannot authorize ORG_B person analytics (tier none).
2. lower role with only `invoices.read` does not gain person analytics (tier none).
3. pseudonymous response contains no original-ID fragment (keyed HMAC form).
4. same person id across tenants → different pseudonym.
5. successful disclosure produces a durable (PROCESSED) canonical BusinessAudit record.
6. audit persistence failure prevents sensitive disclosure (fail closed, no factors).
7. ORG_A audit evidence is tenant-scoped; ORG_B sees none.
8. denied access leaks no foreign existence/PII; recorded as DENIED with no PII.
Plus actor-integrity assertion (audit actor = authenticated server context id).

### Regression
- evaluations-analytics + business-audit + shared/auth suites: 332 passed, 4 skipped, 1 failed.
- The single failure (`shared/auth/fleet-service.permissions.matrix.spec.ts` → station-scoped visibility) is PRE-EXISTING and unrelated to E5.1B: it fails identically at `PRE_E5_1B_HEAD` (baseline A/B confirmed). NEW_E5_FAILURE_COUNT = 0.
- Existing live integration suites (E4 tenant-integrity, E5 quality postgres, E2 entity-reference DB): 15 passed.

## 6. Counters

| Counter | Value |
|---------|-------|
| ORIGINAL_ID_FRAGMENT_IN_PSEUDONYM_COUNT | 0 |
| REVERSIBLE_OR_LEAKY_PSEUDONYM_COUNT | 0 |
| UNPROVEN_PERSON_LEVEL_PERMISSION_GRANT_COUNT | 0 |
| CROSS_TENANT_PRIVACY_LEAKAGE_COUNT | 0 |
| CROSS_ROLE_PRIVACY_LEAKAGE_COUNT | 0 |
| SERVER_SENT_UNAUTHORIZED_FIELD_COUNT | 0 |
| LINEAGE_AUTHORIZATION_BYPASS_COUNT | 0 |
| SENSITIVE_DISCLOSURE_WITHOUT_DURABLE_AUDIT_COUNT | 0 |
| AUDIT_PII_DUPLICATION_COUNT | 0 |
| CROSS_TENANT_AUDIT_READ_LEAKAGE_COUNT | 0 |
| CALLER_SUPPLIED_AUDIT_ACTOR_ACCEPT_COUNT | 0 |
| SENSITIVE_LOG_PAYLOAD_COUNT | 0 |
| NEW_E5_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## 7. Quality gates

| Gate | Result |
|------|--------|
| real PostgreSQL privacy/audit tests | PASS (8/8) |
| privacy tests | PASS |
| audit tests | PASS |
| E1–E5 regressions | PASS (1 pre-existing unrelated failure, baseline-confirmed) |
| backend production typecheck (`tsc -p tsconfig.build.json --noEmit`) | PASS (0 errors) |
| targeted lint (changed files) | PASS (0) |
| Nest build (`nest build`) | PASS |
| Prisma validate | PASS |
| frontend typecheck (`tsc -b`) | PASS |
| frontend build (`vite build`) | PASS |

## 8. Logs

Sensitive-read failure logs contain no raw driver/customer ids, names, emails, tokens, or payloads (org + result only). SENSITIVE_LOG_PAYLOAD_COUNT = 0.

## Status

E5_1B_COMPLETED
