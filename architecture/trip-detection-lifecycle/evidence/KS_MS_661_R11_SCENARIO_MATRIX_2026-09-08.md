# KS MS 661 — TDL-DEC-R11-001 scenario matrix (local design prototype)

> **Integration proof (merged #1584):** Scenarios **A–J** CI PASS on `origin/main` @ `32526c95a` — see [TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md](TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md). **Scenario C** uses a **pre-seeded** `stopBoundaryAt` fixture; **Scenario J** generates the boundary via **orchestration** (`resolveIdleStopBoundaryAt` + ignition OFF) — the KS MS 661 Production entry path.

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-KS-MS-661-SCENARIOS-001 |
| **Method** | SYNTHETIC / RECONSTRUCTED — isolated Node replay @ compiled helpers `684950419…` + inline PROPOSED gate |
| **Not** | Integration test, Production mutation, or authority promotion |
| **Decision** | TDL-DEC-R11-001 — design prototype **S1–S9**; runtime integration **A–J** (TDL-TEST-R11-001 … 005) |

## Prototype scope

- **CURRENT:** `assessSuccessfulEmptyCoreEndEligibility`, `classifyEmptyCoreVlsInactivity`, `resolveOperationalNoCoreInactivityAnchor`, `hasActivityResumed` from compiled backend.
- **PROPOSED:** Inline `EmptyCoreEvidenceV2` with `positiveActivityMaxAgeMs=45000`, `endCorroborationMaxAgeMs=120000`, provider-time operational anchor — **documented only**, not product code.

**Re-run command (sanitized):**

```bash
cd backend && npx tsc -p tsconfig.build.json
# See KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md §Scenario prototype script
```

---

## Scenario results

| # | Scenario | Inputs (summary) | Expected behaviour | CURRENT (local) | PROPOSED (local) | Remaining limit |
|---|----------|------------------|-------------------|-----------------|------------------|-----------------|
| **S1** | Fresh motor-off **60 s** pause, then resume | Empty core; VLS INACTIVE @ motor-off; provider last move T+55s; worker T+120s | Pause **same trip**; **no** `POSSIBLE_END` before 120 s silence; resume via core motion | `operational_inactivity_below_threshold`, VLS INACTIVE — **not eligible** | Same — op silence 65 s < 120 s — **not eligible** | **PASS** pause≠end separation. Pause **tagging** (`pauseDetectedAt`) not in gate — needs orchestration layer. Latency: with 30 s ticks, ~1 min pause visible only if signals arrive; **physical info gap** if no samples ≤60 s. |
| **S2** | Reference-like **136 s** pause, stale speed VLS | Anchor 19:54:21; worker 19:55:52; VLS speed 10 @ obs 19:53:31 | Stale/positive must not imply current motion; no false resume | Op timer 91 s blocks; VLS **UNKNOWN** (141 s) | Op timer blocks; VLS **UNKNOWN** (stale positive decay) | **PASS** — stale speed does not alone reopen. Timer still blocks until ~19:56:21; core returned 19:56:23 in Production. |
| **S3** | Final stop + corroborating INACTIVE | Anchor 19:59:55; worker +124 s; VLS INACTIVE @ stop time | After 120 s silence + **fresh** INACTIVE (<120 s obs age) → `POSSIBLE_END` eligible → R10 | Op met; VLS obs 158 s → **UNKNOWN**, not eligible | Same — corroboration TTL expired | **FAIL** for this synthetic (INACTIVE too old). **PASS** when VLS refreshed: worker 20:02:00 + VLS obs 20:01:30 → **eligible=true** (SYNTHETIC supplement run). Production KS MS 661: VLS went ACTIVE (load) then absent — **INCONCLUSIVE** for natural corroboration. |
| **S4** | Last value ACTIVE, then **total VLS loss** | Null VLS; op silence 304 s | **No** claimed safe end; bounded UNKNOWN handling | `vls_row_absent`, not eligible | Same | **PASS** — no false finalize. Needs observability + backoff (contract §6). |
| **S5** | Actual continuation, **same visible gap** as S4 | Null VLS but core motion after boundary | Must not claim end; must detect resume | Empty-core blocked; `hasActivityResumed=true` if core fetched | Provider anchor advances on new core timestamp; op timer reset | **PASS** — distinct paths: empty-core alone cannot distinguish; **core fetch** required. Identical empty-core inputs → same KEEP_OPEN (no contradictory truths). |
| **S6** | Standstill, **engine running** | speed 0, load 42.7, obs fresh 64 s | Motor activity ≠ vehicle movement; end candidacy blocked while engine active | Op timer + **`vls_engine_load_active`** | Op timer + **STALE_POSITIVE** (64 s >45 s) — does not block on load alone after decay | **PARTIAL PASS** — PROPOSED removes perpetual load block after 45 s; still requires 120 s silence + INACTIVE corroboration for end. Movement still absent — correct. |
| **S7** | Old load + shared VLS timestamp | Single `sourceTimestamp`; load stale semantically | Must not rejuvenate old load because speed row refreshed | **ACTIVE** (load >15, age 98 s <120 s) | **STALE_POSITIVE** after 45 s | **PROPOSED improves** — documents need for **per-field freshness** (PD-4) if provider sends partial updates under one timestamp. |
| **S8** | Provider **403/timeout** vs empty **[]** | Fetch outcome | Different handling; no end on error | Error path: reschedule ACTIVE_TICK, **no gate** (code path) | Same | **PASS** (DOCUMENTED) — orchestration must preserve `fetchOutcome` in forensics (implementation item). |
| **S9** | Duplicate worker / restart mid-UNKNOWN | Same vehicle concurrent ticks | Idempotent gate; no lost next check | Documented: BullMQ dedupe + recovery scheduler | Same + coalesced wake cap 1/episode | **NOT_EXERCISED** in prototype — **DOCUMENTED_LIMITATION**; relies on existing queue contract. |

### Supplement SYNTHETIC — S3 success path

| Input | Result |
|-------|--------|
| worker `20:02:00Z`, anchor `19:59:55.895Z`, VLS `{speed:0, load:0, obs:20:01:30Z}` | PROPOSED **eligible=true**, reason `empty_core_corroborated_inactivity` |

---

## Test result taxonomy

| Scenario | CURRENT | PROPOSED | Production natural |
|----------|---------|----------|-------------------|
| S1 | PASS | PASS | NOT_EXERCISED (pause not tagged) |
| S2 | PASS | PASS | PASS (observed resume) |
| S3 | FAIL (stale VLS age) | FAIL unless fresh VLS | INCONCLUSIVE |
| S4 | PASS | PASS | PASS (ongoing open) |
| S5 | PASS | PASS | PASS (core resumed) |
| S6 | PASS (blocks end) | PASS (decay) | OBSERVED load block |
| S7 | FAIL (load rejuvenation) | PASS (decay) | RECONSTRUCTED |
| S8 | DOCUMENTED | DOCUMENTED | NOT_EXERCISED |
| S9 | DOCUMENTED_LIMITATION | DOCUMENTED_LIMITATION | NOT_EXERCISED |

**Important:** Prototype PASS/FAIL validates **design mechanics only**. Production integration requires items in implementation order (proposal doc §Implementation order).

---

## Integration scenarios (merged #1584 — CI on main)

| Scenario | Boundary source | Test ID | Result |
|----------|-----------------|---------|--------|
| **C** | **Pre-seeded** `stopBoundaryAt` in fixture | TDL-TEST-R11-002 | **PASS** (CI) |
| **J** | **Orchestration-generated** via IDLE + explicit ignition OFF VLS | TDL-TEST-R11-005 | **PASS** (CI) — no STALE_ONGOING |
| A, B, D–I | Unit / integration per implementation record | TDL-TEST-R11-001, 003, 004 | **PASS** (CI) |

Design prototype **S1–S9** below maps conceptually to A–J but uses inline PROPOSED gate — **not** identical to merged runtime.

---

## Cross-reference

- Temporal table: [KS_MS_661_TEMPORAL_FLOW_2026-09-08.md](KS_MS_661_TEMPORAL_FLOW_2026-09-08.md)
- Contract: [KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md](KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md)
