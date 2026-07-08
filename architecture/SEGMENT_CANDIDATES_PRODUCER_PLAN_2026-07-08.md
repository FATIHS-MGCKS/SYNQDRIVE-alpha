# trip_segment_candidates — Producer Plan (2026-07-08)

**Status:** Planned — not in scope for V4.9.266  
**Table:** `synqdrive.trip_segment_candidates`  
**Registry:** `planned_no_producer` (empty is normal today)

---

## 1. Problem / opportunity

Today `IgnitionSegmentDetector` queries `telemetry_state_changes` **live** on every repair scan.
That works but:

- Re-scans the same CH window when reconciliation retries
- No persisted audit trail of what the detector proposed
- Data Analyse cannot show historical segment candidates

`trip_segment_candidates` was created in migration `001_initial_schema.sql` as a **cache /
evidence table** for those proposals — schema exists, writer does not.

---

## 2. What it would store (per row)

| Field (conceptual) | Source |
|--------------------|--------|
| `vehicle_id`, `org_id` | Detector context |
| `segment_start`, `segment_end` | Ignition ON→OFF window from CH |
| `duration_ms`, `confidence` | Detector scoring |
| `detector_name` | `IgnitionSegmentDetector` |
| `repair_phase` | e.g. `repair_missing_trip`, `repair_missing_end` |
| `created_at` | Insert time |

Rows are **evidence only** — they do not create or close PostgreSQL trips.

---

## 3. Proposed producer (when built)

```
TripReconciliationService / repair job
    → IgnitionSegmentDetector.evaluate()
    → (new) SegmentCandidateMirrorService.persist(findings)
    → ClickHouseSegmentCandidatesService.insert(...)
```

**Gating flag (proposed):** `SEGMENT_CANDIDATE_MIRROR_ENABLED=false` (default off), same
pattern as waypoint/HF mirrors.

**Write timing:** After detector run inside repair/reconciliation — never on live map path.

**Idempotency:** ReplacingMergeTree or insert with dedupe key `(vehicle_id, segment_start, repair_phase)`.

---

## 4. Read consumers (future)

| Consumer | Use |
|----------|-----|
| Data Analyse / CH Diagnostics | Table row counts + sample rows |
| Trip detail evidence block | “CH proposed N ignition segments in window” |
| Trip repair debug | Compare PG trip bounds vs cached candidates |

---

## 5. Prerequisites before implementation

1. Mirror flags on prod stable (HF/waypoints/activity) — **done V4.9.266**
2. Confirm repair scan volume / latency (if low, cache is nice-to-have only)
3. UI contract for trip evidence (read-only, no score impact)

---

## 6. Effort estimate (technical, not calendar)

| Piece | Size |
|-------|------|
| CH insert service + migration tweak if needed | Small |
| Producer hook in reconciliation | Small |
| Flag + registry update (`active_if_enabled`) | Trivial |
| Read service + optional UI block | Medium |
| Tests (unit + diagnostics integration) | Small |

**Total:** Medium feature — defer until repair explainability or CH scan cost matters.

---

## 7. Explicit non-goals

- Does **not** replace DIMO Segments as canonical trip boundaries
- Does **not** auto-create trips from CH alone
- Does **not** block reconciliation when CH is down (graceful skip)

---

## 8. Recommendation

**Phase A (now):** Keep live detector; registry documents `planned_no_producer`.  
**Phase B (trigger):** Implement producer when either:

- Repair jobs show repeated CH scans > N/min per vehicle, or
- Product asks for “why was this trip repaired?” evidence in trip detail.

No migration drops; no prod flag until Phase B is tested.
