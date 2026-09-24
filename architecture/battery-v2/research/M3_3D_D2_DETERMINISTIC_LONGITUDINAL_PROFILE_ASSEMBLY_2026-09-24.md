# M3.3D D2 — Deterministic Longitudinal Profile Assembly

**Date:** 2026-09-24  
**Status:** **COMPLETE ON MAIN** — merged PR #1739 @ `ed7adb79b50d28663fd64a2e856f1f615bece046` (PR head `55357add3ce3c2acbb7f0ef595ddd5e4ac4020de`)  
**Input contract:** `M3_3D_D1_LONGITUDINAL_INPUT_V1` (`LongitudinalInputReadResultV1`)  
**Output contract:** `M3_3D_LONGITUDINAL_PROFILE_V1`  
**Assembly policy:** `M3_3D_PROFILE_POLICY_V1`

## M3.3D phase pointer (post-merge)

| Slice | Status |
|-------|--------|
| D0 / D0.1 | **COMPLETE ON MAIN** |
| D1 | **COMPLETE ON MAIN** |
| **D2** | **COMPLETE ON MAIN** (this document) |
| **D3 architecture / D3.1** | **COMPLETE ON MAIN** PR #1744 @ `7919bdd5c` — see `M3_3D_D3_MATERIALIZATION_PERSISTENCE_ARCHITECTURE_2026-09-24.md` |
| **D3 foundation engineering** | **COMPLETE ON MAIN** PR #1746 @ merge `c5c1129f` — **`D3_RUNTIME_REACHABLE=NO`**; production materialization **NOT AUTHORIZED** until **M3.3F** |
| **D4 integrity / inspection** | **NEXT** |
| M3.3E | **PENDING** (health/risk logic) |
| M3.3F | **PENDING** / production shadow authorization |
| M3.3G | **PENDING** |
| M3.3H | **PENDING** customer Vehicle Detail → Health UI |

## Executive summary

D2 is a **pure, read-only** transformation layer. It consumes a successful D1 inventory and assembles the internal longitudinal profile contract. It does **not** query databases, re-run canonical selection, reclassify inclusion, or assign battery health meaning.

**Pure entrypoint:** `assembleLongitudinalProfileV1({ inventory, profileGeneratedAt })` in  
`backend/.../rest-session-features/longitudinal/longitudinal-profile.assembler.ts`.

No Nest provider, API, worker, scheduler, or UI surface is registered for D2.

## Final D2 invariants (on main)

1. **Input:** `M3_3D_D1_LONGITUDINAL_INPUT_V1` only.  
2. **Output:** `M3_3D_LONGITUDINAL_PROFILE_V1`.  
3. **Policy:** `M3_3D_PROFILE_POLICY_V1`.  
4. **Pure transform:** no DB, network, writes, or assembler clock (`Date.now()`).  
5. **DEFAULT** → stable `observations[]`.  
6. **PROVISIONAL** → `provisionalObservations[]` (never promoted into stable series).  
7. **EXCLUDED** → `excludedSessions[]` audit shape.  
8. **Coverage:** `candidateRestSessionCount = included + provisional + excluded`.  
9. **`includedSessionCount`** = DEFAULT only.  
10. **`validEvidenceSpanMs`:** DEFAULT only; 0 DEFAULT → `null`; 1 DEFAULT → `0`.  
11. **Version segments:** DEFAULT only; contiguous chronological runs of full version tuple; `A-B-A` → three segments.  
12. **Ordering:** `anchorAt` ASC; `restSessionId` UTF-16 code-unit tie-break.  
13. **`profileStatus`:** `OK` | `NO_ELIGIBLE_SESSIONS` only.  
14. **`INSUFFICIENT_SESSIONS`:** reserved (DEC-M3.3D-001); not emitted.  
15. **`trendReadiness`:** `NOT_EVALUATED`; no invented minimum-session threshold.  
16. **No truncation inference** from `sessions.length === limit`.  
17. **No** `PARTIAL_COVERAGE` threshold invention.  
18. **`profileGeneratedAt`:** caller-supplied envelope; canonical UTC ISO; not in scientific fingerprint (D3).  
19. **Malformed D1** → deterministic `REJECTED` (no repair).  
20. **Inclusion partition total:** only DEFAULT / PROVISIONAL / EXCLUDED (`INVALID_INCLUSION_MODE` otherwise).  
21. **DEFAULT/PROVISIONAL:** zero `exclusionReasons`.  
22. **EXCLUDED:** ≥1 recognized D1 reason.  
23. **Recognized exclusion reasons:** `NO_CANONICAL_ROW`, `SESSION_INVALIDATED`, `SESSION_TRUST_INVALIDATED`, `INPUT_CONTRACT_VERSION_UNRESOLVED`.  
24. D2 validates D1 **structure** only — does not re-run D1 inclusion policy.  
25. **`anchorAt`:** canonical UTC ISO (`new Date(v).toISOString() === v`).  
26. **D1 window metadata:** matches D1 V1 (`dbSafetyMaxSessions`, `requested === applied`, limits ≤ safety max).  
27. **`LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS`** reused (no duplicate hardcoded cap).  
28. **`perSessionInspectionStatus`:** `NOT_EVALUATED` only.  
29. **Detached output:** profile does not alias mutable D1 nested objects/arrays.  
30. **`derived`:** `null` — no trend/SOH/health/risk.  
31. **No D3 fingerprint** or idempotency key.  
32. **No D4** digest/revision integrity evaluation.

## Contract versions

| Symbol | Role |
|--------|------|
| `M3_3D_LONGITUDINAL_PROFILE_V1` | Profile **shape** (schema version) |
| `M3_3D_PROFILE_POLICY_V1` | Profile **assembly semantics** (policy version) |

Do not conflate contract shape with assembly policy.

## Stable / provisional / excluded separation

D2 **does not reclassify** D1 inclusion modes.

| D1 mode | D2 destination | Counted in `includedSessionCount` |
|---------|----------------|-----------------------------------|
| `DEFAULT` | `observations[]` | **Yes** |
| `PROVISIONAL` | `provisionalObservations[]` | **No** (use `provisionalSessionCount`) |
| `EXCLUDED` | `excludedSessions[]` (audit shape) | **No** (use `excludedSessionCount`) |

Provisional evidence is **not** silently merged into the stable longitudinal series.

## Coverage accounting

```
candidateRestSessionCount
  = includedSessionCount (DEFAULT)
  + provisionalSessionCount (PROVISIONAL)
  + excludedSessionCount (EXCLUDED)
```

`excludedByReason` counts **reason occurrences**; one session may contribute multiple reasons, so the sum of reason counts may exceed `excludedSessionCount`.

`validEvidenceSpanMs` uses **DEFAULT observations only**:

- zero DEFAULT → `null`
- one DEFAULT → `0`
- two+ → `lastAnchor - firstAnchor` (ms)

## Version segmentation

Segments are built from **DEFAULT observations only**, in chronological order. A segment is a **contiguous run** of identical full version tuples:

`(featureModelVersion, retentionPolicyVersion, chargeOpportunityPolicyVersion, inputContractVersion)`.

Pattern `A-A-B-B-A` yields **three** segments (not global grouping of all `A`).

## profileStatus (operational, not health)

| Status | Emitted when |
|--------|----------------|
| `OK` | Assembly succeeded and ≥1 DEFAULT observation |
| `NO_ELIGIBLE_SESSIONS` | Zero DEFAULT observations (including provisional-only inventories) |

`INSUFFICIENT_SESSIONS` is **reserved** for future DEC-M3.3D-001 — **not emitted in D2 V1**.

Assembly failures return `{ status: 'REJECTED', reason }` rather than a profile with `FAILED`.

## profileFlags (evidence-based only)

| Flag | Condition |
|------|-----------|
| `VERSION_SEGMENTED` | `versionSegments.length > 1` |
| `PROVISIONAL_SESSIONS_PRESENT` | `provisionalSessionCount > 0` |
| `INPUT_CONTRACT_UNRESOLVED_PRESENT` | any candidate carries `INPUT_CONTRACT_VERSION_UNRESOLVED` |

Not emitted: `INTEGRITY_LIMITED` (D4), `PARTIAL_COVERAGE`, `TRUNCATED_OLDER_SESSIONS` (no authoritative D1 truncation evidence).

## trendReadiness

D2 V1: `trendReadiness = NOT_EVALUATED`, `minimumSessionsForDescriptiveTrend = null`, `meetsMinimum = null`. No invented minimum session threshold.

## Window / truncation

D2 preserves D1 `requestedSessionLimit` / `appliedSessionLimit`. **`sessions.length === limit` does not prove older sessions exist.** No truncation inference in D2.

`profileGeneratedAt` is **envelope metadata** supplied by the caller — validated canonical UTC ISO; not read from `Date.now()` inside assembly.

## D1 input validation

Reject reasons include: `UNSUPPORTED_D1_CONTRACT`, `IDENTITY_MISMATCH`, `DUPLICATE_REST_SESSION`, `INVALID_WINDOW_METADATA`, `INVALID_INCLUSION_MODE`, `INVALID_EXCLUSION_REASON`, `INCONSISTENT_DEFAULT_ITEM`, `INCONSISTENT_PROVISIONAL_ITEM`, `INCONSISTENT_EXCLUDED_ITEM`, `INVALID_TEMPORAL_METADATA`, `INVALID_PROFILE_GENERATED_AT`, `INVALID_SESSION_IDENTITY`, `INVALID_D1_INSPECTION_STATUS`.

DEFAULT and PROVISIONAL items must have resolved canonical payload and **empty** `exclusionReasons`. EXCLUDED items must carry ≥1 recognized D1 exclusion reason. Unknown inclusion modes or exclusion reasons reject — they are never silently omitted from partition accounting.

### D2.1 closure (contract hardening)

| Area | Behavior |
|------|----------|
| **Total partition** | Only `DEFAULT` / `PROVISIONAL` / `EXCLUDED`; unknown mode → `INVALID_INCLUSION_MODE` |
| **Inclusion coherence** | DEFAULT/PROVISIONAL: empty exclusion reasons; EXCLUDED: ≥1 recognized reason |
| **Temporal** | Every `session.anchorAt` and caller `profileGeneratedAt` must satisfy `new Date(v).toISOString() === v` |
| **D1 window** | `dbSafetyMaxSessions === LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS`; `requestedSessionLimit === appliedSessionLimit`; limits within safety max |
| **D1 item identity** | Non-empty `restSessionId`; `perSessionInspectionStatus === NOT_EVALUATED` |
| **Detached output** | Profile copies canonical/features/version/arrays — no aliasing mutable D1 input |
| **Golden test** | Full expected `LongitudinalProfileV1` structure asserted (37 assembler tests) |

## derived

D2 V1: `derived = null`. No cross-session slopes, SOH proxies, or health scores.

## Boundaries

| Slice | D2 relationship |
|-------|-----------------|
| **D3** | Materialization architecture + persistence contract + **foundation engineering COMPLETE ON MAIN** (PR #1746 @ `c5c1129f`) — **`D3_RUNTIME_REACHABLE=NO`** — `M3_3D_D3_FOUNDATION_ENGINEERING_2026-09-24.md` |
| **D4** | **NEXT** — digest / revision / source-evidence integrity inspection; **not evaluated** by D2 |
| **M3.3E+** | Health, risk, customer conclusions — **out of scope** |

D3 persistence decisions (architecture on main): `HYBRID_IMPLEMENT`; canonical scientific projection fingerprint; append-only revisions; idempotency via Postgres unique + ON CONFLICT; foundation schema authorized; production materialization remains M3.3F-gated.

## Test evidence (validated @ PR #1739 merge)

| Evidence | Result |
|----------|--------|
| D2 assembler / golden (`longitudinal-profile.assembler.spec.ts`) | **37/37 PASS** |
| D1 unit / contract (`longitudinal-input*`, non-integration) | **36/36 PASS** |
| D1 PostgreSQL integration | **5/5 PASS** |
| PR #1739 final CI (head `55357add3`) | **28/28 SUCCESS**; 0 pending; 0 failed |
| D2.1 closure | unknown inclusion mode; inclusion/exclusion coherence; unknown exclusion reason; malformed timestamps; `profileGeneratedAt` validation; D1 safety metadata; detached output; full profile golden vector; D0 §12.1 D1 gate wording |
| `npm run test:battery:v2` differential BASE `9d0dbc7d3` vs D2 head `55357add3` | **11 failures** each — **PRE_EXISTING_BASE_AND_HEAD**; **D2_REGRESSION_FOUND=NO** |

Do **not** claim the entire historical `test:battery:v2` suite is green.

## Non-effects (D2 merge)

`DB_QUERIES_ADDED=NO`, `DB_WRITES_ADDED=NO`, `SCHEMA_CHANGE=NO`, `NEST_PROVIDER_ADDED=NO`, `API_CHANGED=NO`, production deploy/flags unchanged. No D3 persistence; no D4 integrity; no M3.3E health logic; no customer or Master Admin UI.
