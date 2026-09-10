# EXP-021 KS MS 661 — Gap→Settlement Retroactive Assessment

**Date:** 2026-09-10  
**Run:** `945edc40-3002-4b87-83f6-a55d8cf66ffb` · experiment `exp-021-945edc40-e7850aa0`  
**Freeze:** `EXP_021_KS_MS_661_EVIDENCE_FREEZE_2026-09-10.json`  
**Classification:** Retroactive read-only assessment — **not** final EXP-021 closure

---

## Epistemic summary

| Question | Answer | Epistemic |
|----------|--------|-----------|
| Bucket identity maturation across settlement ages? | YES — stable from first success per probe | **CONFIRMED** |
| Per-timestamp native gap → settlement bucket recovery matrix? | NO — timestamp lists not durably persisted | **CONFIRMED** |
| Field value revision across settlement ages? | NO — values not stored on this run | **CONFIRMED** |
| `responseHash` change = value revision? | NO — hash includes age/drift metadata | **CONFIRMED** (corrects prior inference) |

---

## Phase 2 — Forensic gap→settlement mapping (retroactive limits)

### Analyzable physical phases

| Phase | Native gap aggregates | Per-gap matrix | Settlement probes |
|-------|----------------------|----------------|-------------------|
| 60s | max 22.5s, 53 buckets | **NOT_ASSESSABLE** (no persisted `nativeUniqueTemporalBucketStarts`) | SP-60-A/B complete @ +30 |
| 30s | max 29.1s, 31 buckets | **NOT_ASSESSABLE** | SP-30-A/B complete @ +30 |
| 20s | max 18s (partial) | **NOT_ASSESSABLE** | SP-20-A +30 ZERO_RESULT; +60 success |

### What can be proven without per-gap timestamps

1. **LIVE_POLL_CADENCE_GAP** existed during movement (aggregate max gaps 18–29s) — **CONFIRMED** from `completedPhaseSummaries`.
2. Settlement FIXED probes returned **structurally complete bucket identity sets** at first successful age — **CONFIRMED** (no `newBucketIdentities` after first success).
3. Native gaps did **not** manifest as missing settlement bucket identities in probe windows — **INFERRED** from structural stability + independent channels; not a per-gap ledger proof.
4. SP-20-A +30 `ZERO_RESULT` is **QUERY_ZERO_RESULT**, not gap recovery — **CONFIRMED**.

### Classifications not assessable retroactively

- `NOT_ASSESSABLE_NO_OVERLAPPING_SETTLEMENT_PROBE` — requires per-gap timestamp + probe geometry (not persisted).
- `FIRST_SEEN_AT_*` per interior bucket — requires native temporal start list + settlement identity sets (partially available for settlement only).

---

## Phase 3 — Historical value revision provability

```
HISTORICAL_BUCKET_IDENTITY_COMPARISON_POSSIBLE = YES
HISTORICAL_VALUE_REVISION_COMPARISON_POSSIBLE = NO
```

**Missing evidence:** `observationJson.bucketValueSnapshots`, `valueContentHash`, per-bucket normalized values.  
**Not acceptable substitutes:** `responseHash`, row count, payload length, ingest timestamp, query age.

**Acceptable scientific conclusion for this run:** Structural bucket maturation is proven; value stability remains **UNKNOWN**.

---

## Phase 4–5 — Instrumentation added (forward-looking)

For the **next** physical run, Reference Capture now persists per observation:

- `bucketValueSnapshots` — `FIELD|ISO_MS → normalized value`
- `valueContentHash` — SHA-256 of sorted identity=value pairs (no query metadata)
- `valueRevisedBucketIdentities` — cross-age value diffs vs prior successful observation
- Deterministic analyzers: `reference-capture-exp021-gap-settlement-analyzer.ts`, `reference-capture-settlement-shadow-cross-age-analyzer.ts`

---

## Phase 6 — Cadence vs settlement channel isolation

| Channel | Phase 60 REQ/MOVEMENT_MIN | Phase 30 REQ/MOVEMENT_MIN |
|---------|---------------------------|---------------------------|
| Native cadence | 1.338 | 1.714 |
| Settlement | Independent 60s probe windows @ +30…+600 | Same |

**OPTIMAL_CADENCE_DECLARED = NO** — phase 10 missing; phase 20 partial.

---

## Contradiction correction (provenance)

Prior deep-audit language implying `responseHash` changes might indicate value revision is **CONTRADICTED**. Hash includes `actualAgeMs`, `scheduleDriftMs`, and maturation metadata. See forensic report §15 addendum.

---

## WHOLE_TRIP

`BLOCKED_BY_EXTERNAL_TRIP_FSM_WORKSTREAM` — trip `ONGOING`, experiment `vehicleTripId` null.
