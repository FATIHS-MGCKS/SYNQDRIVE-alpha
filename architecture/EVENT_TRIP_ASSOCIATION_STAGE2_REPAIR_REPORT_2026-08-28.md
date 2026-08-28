# Stage 2 — Historical RPM Candidate Repair Report (READ-ONLY)

Date: 2026-08-28
Status: **proposal only — no production data was modified**
Source: production PostgreSQL (`synqdrive`), read-only `SELECT` queries
Input for: controlled historical repair, to be authorized separately after
Stage 1 is merged and deployed.

---

## 1. Method

Every row of `rpm_webhook_candidates` was re-evaluated against the Stage 1
resolver precedence (`architecture/EVENT_TRIP_ASSOCIATION_CONTRACT_2026-08-28.md`
§3), expressed as SQL over `vehicle_trips`:

```sql
-- eligible trips for a candidate
SELECT t.id, t.trip_status FROM vehicle_trips t
WHERE t.vehicle_id = c.vehicle_id
  AND t.trip_status <> 'CANCELLED'
  AND t.start_time <= c.observed_at
  AND (t.trip_status = 'ONGOING'
       OR (t.trip_status = 'COMPLETED' AND t.end_time >= c.observed_at));
```

A candidate is proposed for repair only when this returns **exactly one** trip.

No `UPDATE`, `INSERT` or `DELETE` was executed. No DIMO configuration and no RPM
threshold was touched.

---

## 2. Summary

| Category | Count |
|----------|-------|
| `CORRECT` | 0 |
| `NULL_RESOLVABLE` | 5 |
| `NULL_UNRESOLVABLE` | 5 |
| `WRONG_ASSOCIATION` | 2 |
| `AMBIGUOUS` | 0 |
| **Total** | **12** |

Every candidate that currently holds a non-null `trip_id` is **wrong**. Both
point at the same stale `CANCELLED` trip with `end_time = NULL`, started six
days before the events — exactly the failure mode Stage 1 makes structurally
impossible going forward.

---

## 3. WRONG_ASSOCIATION — 2 candidates

Vehicle `HMÜ C 215` (`8c850ff1-4201-432b-af2e-2711dbc7ca48`).

Current link `ba613969-577d-4992-b358-09a6022fa75a` is
`CANCELLED`, `start_time = 2026-08-02 15:24:00`, `end_time = NULL`. The old
resolver accepted it because `end_time IS NULL` satisfied the upper-bound clause
and `ORDER BY start_time DESC` had no reason to prefer the real trip.

Proposed trip `8f88b0de-1df0-439c-85ce-7c70dd6478d2` is `COMPLETED`,
`2026-08-08 10:55:00 → 2026-08-08 12:43:49.294`, and uniquely contains both
events.

| Candidate | Status | `observed_at` | Current `trip_id` | Proposed `trip_id` | Reason | Confidence |
|-----------|--------|---------------|-------------------|--------------------|--------|------------|
| `2e6d5e68-2a01-4824-9c11-fd8247a8d493` | `CONTEXT_ENRICHED` | 2026-08-08 12:15:40 | `ba613969` (CANCELLED, end NULL) | `8f88b0de` | Stale cancelled trip won the old resolver; exactly one eligible COMPLETED trip contains the event | HIGH |
| `a114d090-9007-445e-968e-585d41705e66` | `CONTEXT_ENRICHED` | 2026-08-08 12:29:17 | `ba613969` (CANCELLED, end NULL) | `8f88b0de` | Same defect, same trip | HIGH |

---

## 4. NULL_RESOLVABLE — 5 candidates

Each resolves to exactly one containing `COMPLETED` trip under Stage 1
semantics. All are safe to repair.

| Candidate | Vehicle | Status | `observed_at` | Current | Proposed `trip_id` | Proposed trip window | Reason | Confidence |
|-----------|---------|--------|---------------|---------|--------------------|----------------------|--------|------------|
| `df220be2-134d-4a59-9df6-b52c3a29b41c` | WOB L 7503 | `CONTEXT_ENRICHED` | 2026-07-10 19:46:46 | NULL | `0dd1f1fe-eeb0-4899-8844-89a0a68c31bc` | 19:31:00 → 19:50:09 | Unique containing finalized trip | HIGH |
| `92ae500c-c8f8-453c-a5d3-1943b2377cf3` | HMÜ C 215 | `CONTEXT_ENRICHED` | 2026-07-19 04:37:19 | NULL | `683bf86b-256e-46a5-bc81-a048d753bd33` | 04:11:39 → 04:41:25 | Unique containing finalized trip | HIGH |
| `4b26d57e-7ba6-443e-803c-59fb5f6d5d43` | WOB L 7503 | `CONTEXT_ENRICHED` | 2026-07-19 16:13:43 | NULL | `c1886eee-585f-4be9-9724-238b63818377` | 13:19:00 → 16:31:00 | Unique containing finalized trip | HIGH |
| `6fd26a7d-6bcf-490c-ae5b-5721595682ae` | KS MX 2024 | `CONTEXT_ENRICHED` | 2026-08-10 18:39:22 | NULL | `a8508cd1-2d10-4371-8e3b-4c72010f7ea9` | 18:28:00 → 18:44:11 | Unique containing finalized trip | HIGH |
| `941382ca-cd2b-48a0-b800-56c4c03abfc7` | KS MX 2024 | `CONTEXT_ENRICHED` | 2026-08-28 11:58:11 | NULL | `61715ecd-b9f7-41eb-a41b-4be852c9eb02` | 11:29:08.726 → 12:01:35 | **The forensic case.** Rolling `end_time` was 11:58:02 at intake; the finalized window contains the event unambiguously | HIGH |

`941382ca` independently reproduces the audit conclusion: the trip identified by
the forensic timeline is the one the Stage 1 resolver selects.

---

## 5. NULL_UNRESOLVABLE — 5 candidates

No trip covers `observed_at`. Each event falls in a gap **between** two
completed trips, so there is no association to repair — the association layer is
behaving correctly.

| Candidate | Vehicle | `observed_at` | Previous trip ends | Next trip starts | Gap |
|-----------|---------|---------------|--------------------|------------------|-----|
| `79c4f647-2085-4783-9a21-fde57c07c991` | HMÜ C 215 | 2026-07-18 12:41:13 | 11:55:53 | 13:25:53 | 90 min |
| `d9197e1f-00cb-49a7-8ae7-52a6df1a0262` | HMÜ C 215 | 2026-07-19 07:28:01 | 05:07:00 | 08:20:01 | 193 min |
| `5e46a6de-8714-45f2-abdd-97142e0709da` | HMÜ C 215 | 2026-07-20 06:47:22 | 06:35:13 | 07:13:11 | 38 min |
| `d6073d34-6585-45c8-b00b-d16fb0d8e2be` | WOB L 7503 | 2026-07-20 06:50:27 | 06:26:44 | 07:09:01 | 42 min |
| `aba38e11-d6f1-4c7a-a9c7-cba8779ed690` | WOB L 7503 | 2026-07-20 06:53:56 | 06:26:44 | 07:09:01 | 42 min |

**Separate finding, not an association defect.** A `> 5000` RPM firing proves
the engine was running, so these gaps indicate missed trip detection rather than
missed linkage. That belongs to trip-detection coverage
(`TripReconciliationService.detectAndRepairMissingTrips`), not to Stage 2. If
those repairs later create trips covering these timestamps, the Stage 1 delayed
sweep will associate the candidates automatically — no manual action needed.

---

## 6. AMBIGUOUS — 0 candidates

No candidate matched more than one eligible trip. Overlapping-trip ambiguity is
handled by the Stage 1 resolver but does not occur in the current dataset.

---

## 7. Proposed Stage 2 execution (NOT EXECUTED)

When authorized, the repair should:

1. Run inside a transaction, one vehicle at a time.
2. Re-derive each proposal at execution time rather than trusting the ids in
   this document — trips may have been repaired or split since it was written.
3. Apply `NULL_RESOLVABLE` (§4) first: these only fill NULLs and carry no risk
   of destroying information.
4. Apply `WRONG_ASSOCIATION` (§3) separately and explicitly. This is the only
   part that overwrites an existing non-null `trip_id`, so it must be opt-in,
   audited, and recorded with the prior value.
5. Skip `NULL_UNRESOLVABLE` and `AMBIGUOUS` entirely.
6. Re-run this report afterwards; the expected end state is
   7 `CORRECT`, 5 `NULL_UNRESOLVABLE`, 0 `WRONG_ASSOCIATION`.

Stage 1 runtime reconciliation deliberately **cannot** perform step 4: it never
overwrites a non-null `trip_id`. The two wrong links will persist until Stage 2
is explicitly authorized.

---

## 8. Related read-path follow-up

`RpmWebhookQueryService.getTripCandidates` currently joins candidates to a trip
by `vehicle_id + observed_at` window instead of by `trip_id`. That read-time
workaround should only be replaced with a direct `trip_id` filter **after** this
repair runs — doing it earlier would hide 10 of 12 historical candidates from
the UI.
