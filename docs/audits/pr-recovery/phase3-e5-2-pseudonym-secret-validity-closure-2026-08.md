# Phase 3 — E5.2 Pseudonym Secret Fail-Closed & Quality Validity Closure (2026-08)

Branch: `integration/evaluations-e5-quality-privacy-authorization-audit-2026-08`
Draft PR: #1025 (OPEN + DRAFT — not merged, not marked ready)
Preconditions: `E5_1A_COMPLETED`, `E5_1B_COMPLETED` (final-acceptance ancestors verified).

Closes the two remaining independent E5 audit blockers only. No E5 redesign.

## 1. Identity & lineage

| Ref | SHA |
|-----|-----|
| E5_2_BASE_MAIN_SHA (`origin/main`) | `960365a9b095a54f4656947ac2067a104e56bd8a` |
| PRE_E5_2_HEAD (`origin/<branch>` = PR headRefOid at start) | `30e99ecc0f0ca5fb985a79bfee7e84a09963ab16` |
| TESTED_CODE_SHA (runtime+tests, frozen) | `9e9e40607fc9d2b88797217c09da61c9ab2a8c8a` |

PR at start: `{ state: OPEN, isDraft: true, baseRefName: main, headRefName: integration/evaluations-e5-quality-privacy-authorization-audit-2026-08 }`, `CURRENT_E5_SHA == headRefOid`.

E5.1 lineage preserved: E5.1A (`61cf4094`), E5.1B (`a6004466`), last tested runtime (`121e127b`) all ancestors. Commits between `121e127b` and `PRE_E5_2_HEAD` were classified: 2 DOCS-only commits (`3a0460ec`, `30e99ecc`), 0 RUNTIME/TEST — previous evidence re-verified, not blindly trusted.

## 2. Blocker 1 — production pseudonym secret fail-closed

### Config authority used
The backend has no global startup secret-validation schema (`ConfigModule.forRoot` in `app.module.ts` declares `load: [...]` factories, no `validate`/`validationSchema`). Config is validated lazily per feature (`registerAs` factories reading `process.env.NODE_ENV`, e.g. `stripe.config.ts` with a `configured` capability flag). Per §8 this is **Model B — capability fail closed**: only the pseudonymous disclosure path fails closed on a missing/invalid secret; unrelated flows (including full-tier) are not broken. No second config framework was introduced.

### Implementation (`privacy/evaluations-privacy.config.ts`)
`resolveEvaluationsPseudonymSecret(env)` returns a discriminated result:
- Non-production: configured secret when present, else the explicit deterministic dev fallback (`source: 'development-fallback'`). The fallback is only reachable when `NODE_ENV !== 'production'` — enforced at runtime, not by comment.
- Production: fail closed — `MISSING` / `EMPTY` / `DEV_FALLBACK_IN_PRODUCTION` (dev fallback or placeholder-looking) / `INSUFFICIENT` (< 32 chars). The dev key is never returned in production. Length is a floor to reject trivial keys, explicitly not an entropy proof.

Failure results carry only a reason code — never the secret value. The secret is never logged, never placed in an error/response, never in audit metadata.

### Boundary (`e4/evaluations-insights.service.ts`)
The secret is resolved only inside the `pseudonymous` branch. On `!ok` the section fails closed: `status = UNAVAILABLE`, `reason = 'PSEUDONYMIZATION_UNAVAILABLE'`, `factors = []` — no raw id, no truncated id, no dev fallback, no partial leak — and records a best-effort DENIED audit (safe metadata only). Full tier does not resolve the secret and is unaffected. HMAC invariants (keyed, domain-separated, no original-ID fragment, tenant/person/version distinct) are unchanged from E5.1B.

## 3. Blocker 2 — quality VALIDITY never fabricates COMPLETE

### VALIDITY meaning (re-audited from first principles)
VALIDITY = affirmative evidence that a served result is structurally/domain valid. It is NOT "the metric was served" (AVAILABLE) and NOT "no error occurred". E5 has no independent structural/domain validity authority on current main.

### Fix (`e5/domain/evaluations-quality.domain.ts`)
`validityState`:
- ERROR / UNAVAILABLE / NOT_APPLICABLE → `UNAVAILABLE` (no valid result to attest).
- AVAILABLE / PARTIAL / STALE → `UNKNOWN` (honest: no validity authority; never a fabricated COMPLETE). This is the single future attest-point if a validity authority is introduced.

### Dimension false-complete audit (§21)
Inspected all dimension helpers for the `absence of error → COMPLETE` anti-pattern:
- FRESHNESS — already `UNKNOWN` when served (E5.1A). No change.
- COMPLETENESS — evidence-based; discovered false-complete for `ratio === null` (unknown expected baseline previously mapped to COMPLETE for AVAILABLE). Corrected to `UNKNOWN`. `ratio === 1` (COMPLETE) and finance `coverage === null` backed by the E3 finance-truth authority are retained.
- PROVENANCE — composite; COMPLETE only when all required source classes present (E5.1A). No change.
- TEMPORAL_APPLICABILITY — `COMPLETE` for served sections is backed by the E1 period-window authority (the metric is computed for exactly the authorized period). Documented; retained.
- Overall roll-up — conservative, never upgrades (E5.1A). No change.

### E5.1 preservation (reconfirmed)
Business-event recency ≠ pipeline freshness; freshness UNKNOWN without ingestion authority; conservative roll-up (AVAILABLE+PARTIAL→PARTIAL etc.); composite finance provenance (E3 invoice+payment); E5.1B permission mapping (`invoices.read` grants nothing); durable-before-disclosure audit — all unchanged and green.

## 4. Tests

- `evaluations-privacy.config.spec.ts` — secret resolution A–G: prod missing/empty/dev-fallback/placeholder/insufficient → fail closed; prod valid → ok; dev/test missing → deterministic fallback; failure results never contain the secret.
- `evaluations-insights.service.spec.ts` — pseudonymous+prod+missing → fail closed (no factors, no raw id, DENIED audit, no critical disclosure); full+prod+missing → unaffected (raw factors, durable-critical audit); pseudonymous+prod+valid → works.
- `evaluations-quality.domain.spec.ts` — VALIDITY per status (served → UNKNOWN, ERROR/UNAVAILABLE/NOT_APPLICABLE → UNAVAILABLE, never COMPLETE); completeness null-ratio → UNKNOWN.
- `evaluations-quality.service.spec.ts` — station-scoped UNAVAILABLE fabricates no COMPLETE dimension; NOT_APPLICABLE/ERROR/AVAILABLE VALIDITY truth.
- Real PostgreSQL (`evaluations-insights.privacy-audit.integration.spec.ts`) — added production+missing-secret authorized pseudonymous request → no factors disclosed.

### Regression counts (TESTED_CODE_SHA `9e9e4060`)
- Real PostgreSQL adversarial (`EVALUATIONS_E4_POSTGRES_INTEGRATION=1`): SUITE_COUNT 4, POSTGRES_INTEGRATION_TEST_COUNT 24, all pass.
- `src/modules/evaluations-analytics` (non-live): SUITE_COUNT 27 (26 passed, 1 skipped), TEST_COUNT 272 (268 passed, 4 skipped [live-gated]).
- Broad `evaluations | business-audit | shared/auth`: SUITE_COUNT 52 (50 passed, 1 skipped, 1 failed), TEST_COUNT 568 (563 passed, 4 skipped, 1 failed).
- The single failure is `shared/auth/fleet-service.permissions.matrix.spec.ts` (station visibility) — `PRE_EXISTING_IDENTICAL` (branch touches nothing under `shared/auth`/fleet; identical to main; also fails at PRE_E5_2_HEAD).

## 5. E1–E4 regression

Covered by the broad evaluations run: E1 (status/PARTIAL/calculationVersion/period+timezone), E2 (tenant/station/RBAC), E3 (Finance invoice+payment authority, money, mixed currency), E4 (cost provenance, utilization PARTIAL, detection coverage, historical telemetry, driver tenant safety) — no regression.

## 6. Quality gates (on TESTED_CODE_SHA)

| Gate | Result |
|------|--------|
| backend production typecheck (`tsc -p tsconfig.build.json --noEmit`) | PASS (0) |
| targeted E5 lint | PASS (0) |
| Nest production build (`nest build`) | PASS |
| Prisma validate | PASS |
| frontend typecheck (`tsc -b`) | PASS |
| frontend production build (`vite build`) | PASS |

Baseline A/B for global CI failures (A = `960365a9`, B = E5.2 candidate): the local `fleet-service` failure and the CI `Typecheck` (spec errors in `billing/*` + `workflows/*`), `Lint` (`lint:all` repo-wide `no-control-regex`/`no-fallthrough`), `Security / dependency scan` (transitive dep vulns), `Backend integration`, `Migration tests`, and `Playwright E2E (Vehicle Detail)` all fail identically on main → `PRE_EXISTING_IDENTICAL`. NEW_E5_FAILURE_COUNT = 0; UNKNOWN_COUNT = 0.

## 7. Final E5.2 counters (recomputed from code/tests)

| Counter | Value |
|---------|-------|
| PRODUCTION_PSEUDONYM_DEV_FALLBACK_COUNT | 0 |
| INSECURE_PSEUDONYM_FALLBACK_DISCLOSURE_COUNT | 0 |
| PSEUDONYM_SECRET_LOG_LEAK_COUNT | 0 |
| PSEUDONYM_SECRET_API_EXPOSURE_COUNT | 0 |
| ORIGINAL_ID_FRAGMENT_IN_PSEUDONYM_COUNT | 0 |
| REVERSIBLE_OR_LEAKY_PSEUDONYM_COUNT | 0 |
| FABRICATED_VALIDITY_COMPLETE_COUNT | 0 |
| FALSE_COMPLETE_QUALITY_DIMENSION_COUNT | 0 |
| BUSINESS_RECENCY_AS_FRESHNESS_COUNT | 0 |
| UNPROVEN_FRESHNESS_AVAILABLE_COUNT | 0 |
| CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT | 0 |
| QUALITY_STATUS_UPGRADE_COUNT | 0 |
| FALSE_COMPLETE_PROVENANCE_COUNT | 0 |
| FALSE_FULL_COVERAGE_COUNT | 0 |
| QUALITY_FALSE_ZERO_COUNT | 0 |
| CROSS_TENANT_LINEAGE_LEAKAGE_COUNT | 0 |
| STATION_LINEAGE_SCOPE_LEAKAGE_COUNT | 0 |
| UNPROVEN_PERSON_LEVEL_PERMISSION_GRANT_COUNT | 0 |
| CROSS_TENANT_PRIVACY_LEAKAGE_COUNT | 0 |
| CROSS_ROLE_PRIVACY_LEAKAGE_COUNT | 0 |
| SERVER_SENT_UNAUTHORIZED_FIELD_COUNT | 0 |
| SENSITIVE_DISCLOSURE_WITHOUT_DURABLE_AUDIT_COUNT | 0 |
| AUDIT_PII_DUPLICATION_COUNT | 0 |
| CROSS_TENANT_AUDIT_READ_LEAKAGE_COUNT | 0 |
| CALLER_SUPPLIED_AUDIT_ACTOR_ACCEPT_COUNT | 0 |
| SENSITIVE_LOG_PAYLOAD_COUNT | 0 |
| ACTIVE_BUT_NOT_CANONICALLY_SERVED | 0 |
| E6_SCOPE_LEAK_COUNT | 0 |
| E7_SCOPE_LEAK_COUNT | 0 |
| E8_SCOPE_LEAK_COUNT | 0 |
| E9_SCOPE_LEAK_COUNT | 0 |
| NEW_E5_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## 8. Runtime freeze

All runtime/test changes are in `9e9e4060` (TESTED_CODE_SHA). The complete E5.2 acceptance suite ran on exactly this SHA. This evidence is recorded in a single docs-only commit; `git diff --name-status TESTED_CODE_SHA..HEAD` contains documentation only (no `.ts/.tsx/.js/json/Prisma/migration/test`).

## Status

E5_READY_FOR_FINAL_MERGE_AUDIT
