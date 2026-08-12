# Phase 3 — E5.2.1 DRIVER Person-Level Authorization Hard-Deny Closure (2026-08)

Branch: `integration/evaluations-e5-quality-privacy-authorization-audit-2026-08`
Draft PR: #1025 (OPEN + DRAFT — not merged, not marked ready).

Closes the final E5 authorization blocker: a `DRIVER` membership must never gain
person-level Evaluations / Driver Influence access via `evaluations.read`,
`customers.read`, or any other module permission. Narrow privacy-boundary rule —
no new permission system, global `EffectiveAccessEngine` unchanged.

## 1. Identity & lineage

| Ref | SHA |
|-----|-----|
| E5_2_1_BASE_MAIN_SHA (`origin/main`) | `960365a9b095a54f4656947ac2067a104e56bd8a` |
| PRE_E5_2_1_HEAD (`origin/<branch>` = PR headRefOid at start) | `75ec13a01238baa1557afbc441f4921062f86c18` |
| TESTED_CODE_SHA (runtime+tests, frozen) | `568d9220bb652d692cd46cfddbe25a9b00e93d34` |

PR at start: `{ state: OPEN, isDraft: true, baseRefName: main, headRefName: integration/evaluations-e5-quality-privacy-authorization-audit-2026-08 }`, `CURRENT_E5_SHA == headRefOid`.

E5.1/E5.2 lineage preserved: E5.1A (`61cf4094`), E5.1B (`a6004466`), E5.1 last tested (`121e127b`), E5.2 tested (`9e9e4060`) all ancestors. The only commit between the E5.2 freeze and `PRE_E5_2_1_HEAD` is the E5.2 docs-only evidence commit (`75ec13a0`, DOCS). Previous evidence re-verified, not blindly trusted.

## 2. Authority chain (reconfirmed)

- Prisma `enum MembershipRole { ORG_ADMIN, SUB_ADMIN, WORKER, DRIVER }` — `DRIVER`
  is a valid membership role; `CUSTOMER` is NOT a membership role.
- The E5 person-level permission authority matrix
  (`phase3-e5-person-level-permission-authority-matrix-2026-08.csv`) documents
  `DRIVER → person-level = none, pseudonymous = no, full = no`.
- The person-level Evaluations policy is strictly stricter than general module read
  permission: a DRIVER may legitimately hold module permissions elsewhere, but is a
  person-level data SUBJECT, never a viewer of person-level Driver Influence.

## 3. The defect and the fix

Before: `resolveEvaluationsPiiTier` granted `full` on `canReadCustomers` and
`pseudonymous` on `canReadEvaluations` for ANY role — so a `DRIVER` with
`customers.read` resolved to `full` and with `evaluations.read` to `pseudonymous`,
contradicting the documented authority.

After (`privacy/evaluations-privacy.policy.ts`): a DRIVER membership is hard-denied
before any permission-based grant:

```
if (platformRole === 'MASTER_ADMIN') return 'full';
if (membershipRole is DRIVER) return 'none';   // E5.2.1 hard deny
if (membershipRole === 'ORG_ADMIN') return 'full';
if (canReadCustomers) return 'full';
if (canReadEvaluations) return 'pseudonymous';
return 'none';
```

This is a narrow rule inside the Evaluations privacy boundary. The global
`EffectiveAccessEngine` and general RBAC are untouched; a DRIVER may still receive
granular permissions elsewhere. Driver self-analytics is NOT introduced (out of
scope; would be separate product design). The fix is a pure policy function
exercised through the real resolver.

DRIVER_PERSON_LEVEL_PERMISSION_GRANT_COUNT = 0.

## 4. Misleading `CUSTOMER` role test corrected

`CUSTOMER` is not a `MembershipRole`. The policy spec no longer implies it is a
runtime role; the case is relabeled as a synthetic unknown-role input (fails
closed). Legitimate `entityType: 'CUSTOMER'` references (entity-reference module)
are unrelated and unchanged.

NON_EXISTENT_ROLE_AS_RUNTIME_AUTHORITY_COUNT = 0.

## 5. Tests

- `evaluations-privacy.policy.spec.ts` — DRIVER hard deny A (evaluations.read),
  B (customers.read), C (both), plus DRIVER with no permission → none;
  non-DRIVER lower roles retain proven access (WORKER/SUB_ADMIN → pseudonymous;
  SUB_ADMIN+customers.read → full); ORG_ADMIN → full; unknown synthetic role → none.
- `evaluations-privacy.resolver.spec.ts` (new) — REAL resolver + REAL permission.util
  + REAL policy (only Prisma mocked): DRIVER+evaluations.read → none, DRIVER+customers.read
  → none, DRIVER+both → none, WORKER+evaluations.read → pseudonymous, SUB_ADMIN+customers.read
  → full, no membership → none, platform MASTER_ADMIN → full (no membership lookup).
- `evaluations-insights.privacy-audit.integration.spec.ts` (real PostgreSQL) — a real
  `OrganizationMembership { role: DRIVER, permissions: {...} }` executing the canonical
  Driver Influence path yields `piiTier=none`, `status=UNAVAILABLE`,
  `reason=PERSON_LEVEL_ACCESS_DENIED`, `factors=[]`, no `driverRef`/pseudonym/raw id;
  cases: evaluations.read, customers.read, both, and cross-tenant (DRIVER in ORG_A
  requesting ORG_B). Denied access is audited with privacy-safe metadata only.

### Counts (TESTED_CODE_SHA `568d9220`)
- Privacy policy + resolver unit: PRIVACY_UNIT_TEST_COUNT (policy) + RESOLVER_TEST_COUNT 7, all pass.
- Real PostgreSQL adversarial suite: POSTGRES_ADVERSARIAL_TEST_COUNT 4 suites / 28 tests, all pass (was 24; +4 DRIVER cases).
- `src/modules/evaluations-analytics` (non-live): 28 suites (27 passed, 1 skipped), 289 tests (285 passed, 4 skipped [live-gated]).
- Broad `evaluations | business-audit | shared/auth`: 53 suites (51 passed, 1 skipped, 1 failed), 585 tests (580 passed, 4 skipped, 1 failed).
- The single failure is `shared/auth/fleet-service.permissions.matrix.spec.ts` — `PRE_EXISTING_IDENTICAL` (branch changes nothing under `shared/auth`/fleet; identical to main).

## 6. Preserved invariants (re-run)

- Audit: denied DRIVER access recorded with non-PII metadata; audit-subsystem
  failure never grants access (denied stays denied — best-effort denial record);
  successful full/pseudonymous disclosure remains durable-audit-critical (fail
  closed if durable audit fails).
- E5.2 production pseudonym secret fail-closed: prod missing/empty/dev-placeholder →
  no pseudonymous disclosure; prod valid → works; dev/test fallback only when
  `NODE_ENV !== 'production'`.
- HMAC pseudonym: stable per org+person+version, different per person, different per
  org, no original-ID fragment.
- Quality truth: business recency ≠ freshness; freshness UNKNOWN; conservative
  roll-up; VALIDITY never fabricated COMPLETE; composite finance provenance.
- E2 tenant/station/RBAC and E4 driver tenant safety unchanged.

## 7. Quality gates (on TESTED_CODE_SHA)

| Gate | Result |
|------|--------|
| backend production typecheck | PASS (0) |
| targeted E5 lint | PASS (0) |
| Nest production build | PASS |
| Prisma validate | PASS |
| frontend typecheck | PASS |
| frontend production build | PASS |

Baseline A/B: the `fleet-service` local failure and the red CI jobs (Typecheck
spec errors in `billing/*`+`workflows/*`, `lint:all` repo debt, dependency-scan
vulns, backend integration, migration tests, Playwright E2E Vehicle Detail) fail
identically on main (`960365a9`) → `PRE_EXISTING_IDENTICAL`.
NEW_E5_FAILURE_COUNT = 0; UNKNOWN_COUNT = 0.

## 8. Final E5.2.1 counters (recomputed)

| Counter | Value |
|---------|-------|
| DRIVER_PERSON_LEVEL_PERMISSION_GRANT_COUNT | 0 |
| NON_EXISTENT_ROLE_AS_RUNTIME_AUTHORITY_COUNT | 0 |
| DRIVER_DENIAL_AUDIT_PII_LEAK_COUNT | 0 |
| AUDIT_FAILURE_AUTHORIZATION_BYPASS_COUNT | 0 |
| PRODUCTION_PSEUDONYM_DEV_FALLBACK_COUNT | 0 |
| INSECURE_PSEUDONYM_FALLBACK_DISCLOSURE_COUNT | 0 |
| ORIGINAL_ID_FRAGMENT_IN_PSEUDONYM_COUNT | 0 |
| REVERSIBLE_OR_LEAKY_PSEUDONYM_COUNT | 0 |
| UNPROVEN_PERSON_LEVEL_PERMISSION_GRANT_COUNT | 0 |
| CROSS_TENANT_PRIVACY_LEAKAGE_COUNT | 0 |
| CROSS_ROLE_PRIVACY_LEAKAGE_COUNT | 0 |
| SERVER_SENT_UNAUTHORIZED_FIELD_COUNT | 0 |
| SENSITIVE_DISCLOSURE_WITHOUT_DURABLE_AUDIT_COUNT | 0 |
| AUDIT_PII_DUPLICATION_COUNT | 0 |
| CROSS_TENANT_AUDIT_READ_LEAKAGE_COUNT | 0 |
| CALLER_SUPPLIED_AUDIT_ACTOR_ACCEPT_COUNT | 0 |
| BUSINESS_RECENCY_AS_FRESHNESS_COUNT | 0 |
| UNPROVEN_FRESHNESS_AVAILABLE_COUNT | 0 |
| QUALITY_STATUS_UPGRADE_COUNT | 0 |
| FALSE_COMPLETE_PROVENANCE_COUNT | 0 |
| FABRICATED_VALIDITY_COMPLETE_COUNT | 0 |
| FALSE_COMPLETE_QUALITY_DIMENSION_COUNT | 0 |
| ACTIVE_BUT_NOT_CANONICALLY_SERVED | 0 |
| E6_SCOPE_LEAK_COUNT | 0 |
| E7_SCOPE_LEAK_COUNT | 0 |
| E8_SCOPE_LEAK_COUNT | 0 |
| E9_SCOPE_LEAK_COUNT | 0 |
| NEW_E5_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## 9. Runtime freeze

All runtime/test changes are in `568d9220` (TESTED_CODE_SHA). The complete E5.2.1
acceptance ran on exactly this SHA. This evidence is a single docs-only commit;
`git diff --name-status TESTED_CODE_SHA..HEAD` contains documentation only.

## Status

E5_READY_FOR_FINAL_MERGE_AUDIT
