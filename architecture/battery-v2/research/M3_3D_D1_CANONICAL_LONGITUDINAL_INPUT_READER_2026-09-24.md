# M3.3D D1 — Canonical longitudinal input reader + inclusion policy (2026-09-24)

**Status:** **COMPLETE ON MAIN** — squash-merged PR #1737 @ `9577e0f146ddec2b81fc2ede35389a5fa2e6db94` (PR head `295a4e94e`)  
**Contract:** `M3_3D_D1_LONGITUDINAL_INPUT_V1`  
**Authority:** `M3_3D_D0_LONGITUDINAL_PROFILE_ARCHITECTURE_2026-09-24.md` (D0/D0.1 **COMPLETE ON MAIN**)  
**D1.1 closure:** Contract/test hardening on PR #1737 (no Master Admin UI; no D2) — merged with D1.

## Purpose

Deterministic **input inventory** for a bounded rest-session window (not longitudinal profile assembly):

- canonical C3 feature row per session (C5A-equivalent selection)
- persisted version provenance from row + guarded `inputSummary`
- inclusion mode: `DEFAULT` | `PROVISIONAL` | `EXCLUDED`
- `perSessionInspectionStatus = NOT_EVALUATED` (D1 integrity scope)

**Not in D1:** `M3_3D_LONGITUDINAL_PROFILE_V1` assembly (D2), trends, health, persistence, customer or Master Admin surfaces.

## M3.3D phase pointer (post-merge)

| Slice | Status |
|-------|--------|
| D0 / D0.1 | **COMPLETE ON MAIN** |
| **D1** | **COMPLETE ON MAIN** (this document) |
| **D2** | **COMPLETE ON MAIN** — PR #1739 @ `ed7adb79b` — see `M3_3D_D2_DETERMINISTIC_LONGITUDINAL_PROFILE_ASSEMBLY_2026-09-24.md` |
| **D3 architecture / D3.1** | **COMPLETE ON MAIN** PR #1744 @ `7919bdd5c` — see `M3_3D_D3_MATERIALIZATION_PERSISTENCE_ARCHITECTURE_2026-09-24.md` |
| **D3 foundation engineering** | **NEXT** — schema/migration/internal service (**NOT IMPLEMENTED**) |
| D4+ | **PENDING** |
| M3.3E | **PENDING** (health/risk logic) |
| M3.3F | **PENDING** / production shadow authorization |
| M3.3G | **PENDING** |
| M3.3H | **PENDING** customer Vehicle Detail → Health UI |

## Code map

| File | Role |
|------|------|
| `longitudinal/longitudinal-input.constants.ts` | Contract id; `LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS=100` (**DB_SAFETY_BOUND**, not scientific default) |
| `longitudinal/longitudinal-input.types.ts` | Request/result/inventory types |
| `longitudinal/longitudinal-input.repository.ts` | Bounded session page + **single batch** canonical candidates (`ROW_NUMBER` partition) |
| `longitudinal/longitudinal-input.reader.ts` | `RepeatableRead` snapshot + canonical policy + parser + inclusion |
| `longitudinal/longitudinal-input.policy.ts` | Pure inclusion function |
| `longitudinal/longitudinal-input.snapshot-parser.ts` | Strict guard for D1-consumed `inputSummary` fields (no silent coercion) |
| `LongitudinalInputReaderService` | Nest provider (`generalized-evidence.module.ts`); no HTTP route |

**No frontend changes:** D1 authority lives in `architecture/battery-v2/*` and backend internal code/tests only.

## D1 invariants (active on main)

1. Internal contract: `M3_3D_D1_LONGITUDINAL_INPUT_V1`.
2. D1 is **input inventory only** (no profile materialization).
3. DB safety hard cap: **100 sessions** — not a scientific evidence threshold.
4. Session read: `organizationId` + `vehicleId` scoped, bounded, `anchorAt` time authority.
5. Output ordering: `anchorAt` ASC, `restSessionId` UTF-16 code-unit tie-break (`compareUtf16CodeUnitLexicographic`).
6. Equal `anchorAt`: **valid** — not an exclusion.
7. Canonical candidates: one bounded batch query; ≤4 phase/trust candidates per session.
8. Canonical selector: `selectCanonicalRestSessionFeatureShadowRow()` — C5A-equivalent semantics.
9. **No N+1** per-session feature queries; forbidden: `listFeatureRowsForSession()` for M3.3D.
10. Coherent snapshot: `RepeatableRead` transaction.
11. Tenant isolation: org + vehicle; same-org wrong-vehicle protected.
12. Persisted column versions (`featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`) **always** from selected persisted row when canonical exists.
13. `inputContractVersion` from guarded persisted `inputSummary`.
14. Failed input-contract parse **does not erase** persisted column versions (`inputContractResolution=UNRESOLVED`).
15. Strict consumed-field validation: identity, `inputContractVersion`, `anchorResolution.status`, `temperatureC`, `temperatureSource`, `contextCompleteness`.
16. Inclusion modes: `DEFAULT`, `PROVISIONAL`, `EXCLUDED`.
17. Active valid `INCREMENTAL` → `PROVISIONAL`.
18. Terminal unexpected `INCREMENTAL` → `PROVISIONAL`.
19. D1 exclusions: `NO_CANONICAL_ROW`, `SESSION_INVALIDATED`, `SESSION_TRUST_INVALIDATED`, `INPUT_CONTRACT_VERSION_UNRESOLVED`.
20. `NO_CANONICAL_ROW` must **not** cascade non-applicable `INPUT_CONTRACT_VERSION_UNRESOLVED`.
21. `chargeOpportunityClass` preserved; **not** a D1 exclusion gate.
22. No scientific threshold gates (point count, span, missing rungs, voltage, slope, temperature).
23. D1 integrity scope: **canonical selection integrity only**.
24. `perSessionInspectionStatus = NOT_EVALUATED`.
25. Digest / revision / coverage integrity: **D4+**.
26. D1 remains **read-only** (no writes).
27. No customer API or customer UI.
28. No Master Admin UI.
29. No schema or migration in D1.
30. No runtime flag activation in D1.

## Bounded reads

1. **Sessions:** `batteryRestSession.findMany` tenant-scoped, `orderBy anchorAt desc, id desc`, `take sessionLimit`.
2. **Session limit:** positive integer `1…100`; `INVALID_SESSION_LIMIT` or `SESSION_LIMIT_EXCEEDED`.
3. **Features:** one `$queryRaw` batch — ≤ `4 × sessionCount` candidates.
4. **Forbidden:** `listFeatureRowsForSession()`; per-session candidate loops.

## Version provenance

When a **canonical row exists**, column tuple from row; `inputContractVersion` + `inputContractResolution` from parser. Runtime constants scope SQL only — not output historical authority.

## Inclusion policy (D1)

| Mode | Rule |
|------|------|
| **EXCLUDED** | No canonical row; session/canonical trust invalidated; unresolved input contract **when canonical row exists** |
| **PROVISIONAL** | Active + valid INCREMENTAL; terminal + unexpected INCREMENTAL |
| **DEFAULT** | Valid contract + canonical VALID + not provisional |

## Integrity boundary

**D1:** `CANONICAL_SELECTION_INTEGRITY` only. **D4+:** digest / lineage / coverage (bounded batch, not N× `inspectSession()`).

## Coherent snapshot

`Prisma.$transaction` **`RepeatableRead`**: session page → optional test barrier → batch feature candidates. Integration `PG_D1_RR`: concurrent append does not change selected canonical revision in open snapshot.

## Test evidence (validated @ PR #1737 merge)

| Evidence | Result |
|----------|--------|
| Focused unit + contract (`longitudinal-input`, non-integration) | **36/36 PASS** |
| PostgreSQL integration (`npm run test:battery:v2:longitudinal-input:postgres`) | **5/5 PASS** |
| PR #1737 CI (exact head `295a4e94e`) | **46/46 SUCCESS**; 0 pending; 0 failed |
| RepeatableRead concurrent append | **PASS** |
| Bounded batch ≤4 phase/trust | **PASS** |
| Tenant + same-org wrong-vehicle | **PASS** |
| Current-version SQL scope | **PASS** |
| UTF-16 equal-anchor ordering | **PASS** |
| Persisted version provenance on contract failure | **PASS** |
| Malformed consumed snapshot | **PASS** |
| Charge-class preservation | **PASS** |
| Scientific-threshold non-gate | **PASS** |
| Anchor-resolution matrix | **PASS** |
| Read-only (no create/update/delete/upsert) | **PASS** |
| `npm run test:battery:v2` differential vs base `6d250da6f` | **11 failures** base and D1 head — **PRE_EXISTING_BASE_AND_HEAD**; **D1_REGRESSION_FOUND=NO** |

Do **not** claim the entire historical `test:battery:v2` suite is green.

## D3 boundary (next slice — not implemented)

D3 introduces the **materialization / persistence** boundary (fingerprint, revision model, schema, idempotency, M3.3F authorization). D2 on main provides pure `assembleLongitudinalProfileV1()` only — no D3 tables, writers, or fingerprint implementation.

## Non-effects (D1 merge)

- No production deploy; no runtime flag change; no schema/migration; no production data mutation
- D2 **COMPLETE ON MAIN** (PR #1739); **no D3** persistence; no M3.3E health logic; no customer UI; no Master Admin UI
- No `BatteryAssessment` / `BatteryPublication` / `BatteryFeatures` writes
