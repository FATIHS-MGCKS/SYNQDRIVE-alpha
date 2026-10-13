# EXP021 — Near-real-time trip processing contract correction

**Status:** PROPOSED (code + governance; **STOP BEFORE MERGE**; no production deploy in this workstream)

**Owner product decision:** Driving Intelligence shall analyze trips soon after completion in regular SynqDrive operation. The blanket 24-hour settlement quiet period is **not** desired product latency. Wave-3 T24 audit (`2026-10-14T04:38:41Z`) is **retrospective** operations/quality assurance only.

## A — Technical root cause (24h blockers)

| Layer | Mechanism | Role |
|-------|-----------|------|
| `s4a-contract.v2.json` / `di-v0-s4a-contract.ts` | `quietPeriodSeconds` / `settlementQuietPeriodSeconds` | Authoritative delay constant |
| `di-v0-s4b-discovery.service.ts` | `anchor + quiet <= now()` | Discovery candidate gate |
| `di-v0-s4a-work-item.repository.ts` T01 + successor | `next_attempt_at` / `eligible_at` = anchor + quiet | Claim eligibility (`NEXT_ATTEMPT_DUE`) |
| DB `di_v0_s4_wi_eligible_ck` | Was equality at `+24h` | Enforced same delay on insert (relaxed in migration) |

**Not 24h blockers (unchanged):** claim uses `next_attempt_at`; worker scheduling (`claimLoopIntervalMs` 30s); T07 retry backoff; T11/T13 boundary supersede; S4E drift horizon (10d); allowlist/kill-switch; `ACTIVE_PRIMARY` uniqueness.

## B — Original settlement rationale (what 24h protected)

- Late DIMO segment / trip boundary corrections (`trip_repairs`, anchor = `max(end_time, created_at, last APPLIED repair)`).
- Unrecorded boundary mutation detection via fingerprint at claim + complete (T06).
- Avoiding duplicate PRIMARY work before trip metadata stabilizes.
- Alignment with historical EXP-021 **settlement-shadow** calibration experiments (not production DI latency).

**Conclusion:** A **short** configurable quiet period plus existing fingerprint/retry/supersede paths is sufficient; 24h is not required for safety.

## C — Target policy (this change)

- **`quietPeriodSeconds`: 600 (10 minutes)** — fits 5–15 min product target with 5 min discovery interval (~10–15 min worst-case).
- **Floor/ceiling in contract:** 300s–86400s for governance validation.
- **Late telemetry:** T07 retry / abstention / S4E drift — not invented results.
- **Trip repair:** Anchor advances; discovery waits `anchor + quiet` (repair applied 2 min ago → not discovered in D05).
- **Historical work items:** No backfill; rows with `eligible_at = anchor + 24h` remain valid via relaxed CHECK.

## D — T24 metric segmentation

T24 (`2026-10-14T04:38:41Z`) is **retrospective QA only** — not a processing wait.

**Persisted technical label (no new column):**  
`settlement_quiet_seconds = extract(epoch FROM (eligible_at - settlement_anchor_at))` on `di_v0_s4_work_items`, classified via `classifyDiV0S4SettlementPolicySegment()` (`NEAR_REALTIME_600` | `LEGACY_86400` | `OTHER`).

**Segment T24 metrics at query time:**

- `deployed_at` = production release timestamp when this PR ships.
- Rows with `created_at < deployed_at` and `settlement_quiet_seconds ≈ 86400` → `processing_policy=legacy_86400`.
- Rows with `created_at >= deployed_at` and `settlement_quiet_seconds ≈ 600` → `processing_policy=near_realtime_600`.
- Mixed-era latency (trip end → discovery → claim → COMPLETED) must be reported **per segment**, not blended.

**Latency axes (product goal ≠ measured SLA until post-deploy):**

| Axis | Measurement |
|------|-------------|
| Trip end → discovery (T01) | `min(work_item.created_at) - trip.end_time` per trip |
| Discovery → enqueue | N/A (T01 is synchronous insert); use created_at as enqueue |
| Enqueue → worker COMPLETED | `completed_at - first claim (lease_acquired_at)` |
| Trip end → business result | `completed_at - trip.end_time` (shadow/S2 availability) |

## Governance

- S4A contract v2 value change (not a new contract version id).
- Migration `20261013120000_di_v0_s4_near_realtime_eligible_ck` only relaxes CHECK.
- Run `node architecture/drivingintelligence/scripts/validate-s4a-contract.mjs` before merge.
