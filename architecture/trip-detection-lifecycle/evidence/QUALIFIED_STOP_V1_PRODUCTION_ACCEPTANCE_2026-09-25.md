# Qualified Stop Contract V1 — Production acceptance (read-only audit)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| **Observed at (UTC)** | `2026-09-25` (authority rebaseline; natural-case SQL window anchored from QS-active Production release) |
| **Epistemic** | CONFIRMED (read-only Production Postgres + release SHA verification) |
| **Acceptance classification** | **`PASS_WITH_EVIDENCE_GAPS`** — **not** `FULLY_PRODUCTION_VALIDATED` for all Qualified-Stop paths |
| **Decision status** | TDL-DEC-QS-V1-001 — **PRODUCTION_PRESENT**; natural SAME_TRIP controls **PASS**; natural SPLIT / POST_SPLIT_TRIP2 **INSUFFICIENT_EVIDENCE** in audit window |

## Production baseline (verified at acceptance time — historical evidence anchor)

This document records the **acceptance-time Production anchor** (`99d722b4…` @ `20260924235024_v4994`). It is **not** a claim about latest/current Production; later releases (e.g. `8a1d9c6586…` @ `20260925182907_v4994`) supersede the deploy pointer only for **current-runtime** audits, not this acceptance artifact.

| Field | Value |
|-------|-------|
| **Production SHA** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` |
| **Release** | `20260924235024_v4994` |
| **PR #1750** | **ancestor / present** on Production (`3067fad1aad509c29b2c83a6f3f0b16135da7a63` merge) |
| **PR #1753** | **ancestor / present** on Production (`b0a7cd08942e94cf0ff5010b417d4b2beabedca6` merge) |
| **Prior QS-active release (historical, same audit lineage)** | `e30de7591d97868e24d6e1f379a71b52ada8a3eb` @ `20260924201136_v4994` — natural-case observation window opens from this deploy timestamp |

**Repo vs Production:** `origin/main` @ rebaseline audit **`d6ff7e198110ff7401d03389c232398af47766f0`** (`REPO_CURRENT`) is **not** identical to Production @ `99d722b4…` — do not conflate axes ([CURRENT_STATE.md](../CURRENT_STATE.md)).

## Qualified Stop Contract V1 (runtime authority)

| Rule | Semantics |
|------|-----------|
| **Threshold** | `QUALIFIED_STOP_THRESHOLD_MS` = **300_000** |
| **Same trip** | `durationMs <= 300_000` → **SAME_TRIP** (no mid-gap split) |
| **Split** | `durationMs > 300_000` → **SPLIT** |
| **Config source (Production)** | **`CANONICAL_DEFAULT`** — env keys absent; resolver uses canonical default chain |
| **Shared authority surfaces** | Trip orchestration live mid-gap, merge/reopen, reconciliation mid-gap policy, `TripQualityDetector` — **aligned** (`QUALIFIED_STOP_AUTHORITIES_ALIGNED=YES`) |

### Independent repair / coverage authority (explicit non-merge)

**`MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS=180`** remains a **separate** repair/coverage authority (partial boundary repair, uncovered-span tolerance). It is **not** the Qualified Stop V1 same-trip/split duration contract.

Design cross-ref: [QUALIFIED_STOP_CONTRACT_V1_2026-09-24.md](QUALIFIED_STOP_CONTRACT_V1_2026-09-24.md) · PR #1753 closure ledger.

## Natural Production acceptance (audit window)

| Metric | Result |
|--------|--------|
| **NATURAL_SAME_TRIP_CASES_FOUND** | 3 |
| **NATURAL_SAME_TRIP_CASES_PASS** | 3 (**3/3**) |
| **NATURAL_SPLIT_CASES_FOUND** | 0 |
| **POST_SPLIT_TRIP2_CASES_FOUND** | 0 |
| **Natural qualified stop > 300_000 ms (split path)** | **None observed** in investigated window |
| **NEW_RUNTIME_DEFECT_FOUND** | **NO** |

### Evidence gaps (not runtime failures)

- No natural qualified stop **>** 300_000 ms in the investigated Production window → **no natural SPLIT acceptance case**.
- No natural **POST_SPLIT_TRIP2** acceptance case after #1750 in the window.
- No near-threshold SPLIT case in the window.
- Shadow divergences **not evaluated** (short observation window) — see Shadow section.

**Classification:** **`FSM_POST_QUALIFIED_STOP_ACCEPTANCE=PASS_WITH_EVIDENCE_GAPS`**. Missing natural cases are **evidence gaps**, not proof of incorrect runtime semantics.

## Regression scan (audit window)

Observed failure signatures in the read-only audit window:

| Signature | Result |
|-----------|--------|
| END_VALIDATION retry-budget reset loop | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| Provider-silence / post-movement telemetry dead zone | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| PEC→EV lock-order handoff loss (#1603 class) | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| ClickHouse assist false terminal (CH skip without resume revalidation) | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| Stale ONGOING trip | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| Duplicate trip row | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| Boundary overlap | **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| Reconciliation duplication | **NOT_OBSERVED_IN_AUDIT_WINDOW** |

**Wording:** `NOT_OBSERVED_IN_AUDIT_WINDOW` — **not** `IMPOSSIBLE` or `GLOBALLY_PROVEN_ABSENT`.

## Shadow runtime

| Field | Value |
|-------|-------|
| **SHADOW_RUNTIME_PRESENT** | YES |
| **SHADOW_RUNTIME_ENABLED** | YES (acceptance-time Production @ `99d722b4…`; introduced with #1648 merge lineage; also present on later releases) |
| **SHADOW_DIVERGENCES_OBSERVED** | **NOT_EVALUATED_SHORT_WINDOW** |

No shadow accuracy or counterfactual correctness claims are made here. Detail: [SHADOW_END_PAUSE_OBSERVABILITY_2026-09-14.md](SHADOW_END_PAUSE_OBSERVABILITY_2026-09-14.md).

## Related PR / merge state (authority cross-ref)

| PR | Main | Production @ `99d722b4…` | Notes |
|----|------|---------------------------|-------|
| #1627 | MERGED | Present (ancestor) | Retry-budget POSSIBLE_END re-entry |
| #1635 | MERGED | Present (ancestor) | Provider-silence × #1627 continuity |
| #1648 | MERGED | Present (ancestor) | Shadow observability — **enabled** on acceptance-time Production @ `99d722b4…` |
| #1674 | MERGED | Present (ancestor) | FETCH_UNCERTAIN bounded CUSUM handoff |
| #1750 | MERGED | **PRODUCTION_PRESENT** | Post-split finalize quality — natural post-split trip2 acceptance **evidence-gapped** |
| #1753 | MERGED | **PRODUCTION_PRESENT** | Qualified Stop V1 — 3/3 natural SAME_TRIP controls **PASS** |

## Limitations

- Short fleet activity window (few trips) — see natural-case counts.
- Does **not** re-validate every historical R1–R8 behavior path on Production (TDL-OQ-007 remains **partially** resolved).
- Does **not** authorize deploy, Production mutation, or promotion to `AUTHORITY_ACTIVE`.
