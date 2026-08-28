# Stage 2 — Historical RPM Candidate Repair: EXECUTION RECORD

Date: 2026-08-28
Status: **EXECUTED — 7 production rows repaired, verified, idempotent**
Supersedes the proposal in `EVENT_TRIP_ASSOCIATION_STAGE2_REPAIR_REPORT_2026-08-28.md`.
Contract: `EVENT_TRIP_ASSOCIATION_CONTRACT_2026-08-28.md`

---

## 1. Purpose

Stage 1 (PR #1385) made the Event → Trip resolver correct going forward but
deliberately could not repair history: runtime reconciliation never overwrites a
non-null `trip_id`, so wrong links persist by design. Stage 2 is the separately
authorized, one-off repair of the historical `rpm_webhook_candidates` backlog.

The governing rule for every row was:

> A wrong or NULL association may be repaired **only** when exactly one canonical
> trip is proven. Ambiguous beats guessed. NULL beats wrong.

---

## 2. Production baseline at execution time

| Item | Value |
|------|-------|
| Production SHA | `5cc9c22032346c6d2df1738444520c93da8c72b5` |
| Release | `20260828152525_v4994` |
| PR #1385 merge commit | `4f8a70f8238216b636a6fe49d3648dc981c567eb` (ancestor: yes) |
| Migration | `20260828120000_rpm_candidate_event_trip_reconciliation_index` applied `15:27:56Z` |
| Index | `rpm_webhook_candidates_vehicle_id_observed_at_idx`, `indisvalid=t`, `indisready=t` |
| API health | HTTP 200 |
| PM2 | online, `unstable_restarts=0` |
| Rows | 12 (`trip_id` NULL = 10, non-null = 2) |
| Pre-mutation checksum | `d75060e76bbbcc95a15f2f7f12bb1235` |
| Post-mutation checksum | `7046a0a8d5beeb3970e805182512ea62` |

---

## 3. Method — decisions came from the deployed resolver

Classification was **not** re-implemented in SQL for the decision path. The
compiled `EventTripAssociationService` from the running release was instantiated
against production Prisma and `resolveForEvent()` was called per candidate. SQL
was used only to produce independent corroborating evidence.

Each candidate was resolved **twice** before being eligible for mutation; a
result that differed between runs would have been classified unstable and
skipped. No candidate was unstable.

---

## 4. Before / after classification

| Classification | Before | After |
|----------------|--------|-------|
| `CORRECT` | 0 | **7** |
| `NULL_RESOLVABLE` | 5 | **0** |
| `NULL_UNRESOLVABLE` | 5 | **5** |
| `WRONG_ASSOCIATION` | 2 | **0** |
| `AMBIGUOUS` | 0 | **0** |
| Total | 12 | 12 |

---

## 5. Mutation set applied (7 rows, one transaction)

### A. NULL backfills — 5 rows

| Candidate | `observed_at` | Before | After | Tier |
|-----------|---------------|--------|-------|------|
| `df220be2` | 2026-07-10 19:46:46 | NULL | `0dd1f1fe` | `FINALIZED_WINDOW_MATCH` |
| `92ae500c` | 2026-07-19 04:37:19 | NULL | `683bf86b` | `FINALIZED_WINDOW_MATCH` |
| `4b26d57e` | 2026-07-19 16:13:43 | NULL | `c1886eee` | `FINALIZED_WINDOW_MATCH` |
| `6fd26a7d` | 2026-08-10 18:39:22 | NULL | `a8508cd1` | `FINALIZED_WINDOW_MATCH` |
| `941382ca` | 2026-08-28 11:58:11 | NULL | `61715ecd` | `FINALIZED_WINDOW_MATCH` |

### B. Wrong-association corrections — 2 rows

| Candidate | `observed_at` | Before | After | Tier |
|-----------|---------------|--------|-------|------|
| `2e6d5e68` | 2026-08-08 12:15:40 | `ba613969` (CANCELLED) | `8f88b0de` | `FINALIZED_WINDOW_MATCH` |
| `a114d090` | 2026-08-08 12:29:17 | `ba613969` (CANCELLED) | `8f88b0de` | `FINALIZED_WINDOW_MATCH` |

No `non-null → NULL` mutation was proposed or applied.

---

## 6. Wrong-association root cause

`ba613969` is `CANCELLED` with `end_time IS NULL` and `start_time 2026-08-02
15:24`, six days before the two events. The legacy predicate
`end_time IS NULL OR end_time >= observed_at` treated the open end as "still
running", and `ORDER BY start_time DESC LIMIT 1` then preferred it over the real
trip. The stored trip never contained either event.

The canonical trip `8f88b0de` (`COMPLETED`, `2026-08-08 10:55:00 → 12:43:49.294`)
contains both events and was the sole eligible trip for each.

---

## 7. Safety model of the write

Every row was mutated inside a single transaction, and each write was preceded by
four guards. Any failure raised and rolled the whole transaction back.

1. **Concurrency guard** — current `trip_id` must still equal the dry-run value.
2. **Resolver re-derivation** — the deployed resolver was re-run inside the
   transaction; any drift from the frozen set aborts.
3. **Target validation** — target must exist, must not be `CANCELLED`, must
   belong to the same vehicle, and must contain `observed_at`.
4. **Guarded UPDATE** — `WHERE id = ? AND trip_id IS NULL` for backfills,
   `WHERE id = ? AND trip_id = <expected_old>` for corrections; `affected_rows`
   had to equal exactly 1.

The mutation set was frozen as literal data in the script, so the writer could
not widen its own scope even if the resolver had changed.

---

## 8. Post-write verification

- 12 rows, 12 distinct ids — nothing deleted, duplicated or recreated
- 7 linked, all to `COMPLETED` trips; 0 linked to `CANCELLED`; 0 orphan FKs
- Every link satisfies containment and vehicle match
- `observed_at`, `observed_value`, `threshold`, `created_at`, `status` byte-identical to the pre-mutation snapshot for all 12 rows
- `updated_at` changed only on the 7 mutated rows; the 5 untouched rows kept their original values
- `ba613969` is referenced by zero candidates
- `vehicle_trips` untouched — `ba613969` is still `CANCELLED` with `end_time NULL`, and all six target trips retain identical windows

---

## 9. Idempotency

Re-running the full classification and the repair logic in dry-run after the
mutation yields `PROPOSED_MUTATIONS = 0`. Every repaired row now classifies as
`CORRECT`, and the guarded predicates make a second execution a no-op even if
invoked again.

---

## 10. Remaining `NULL_UNRESOLVABLE` — 5 candidates

`79c4f647`, `d9197e1f`, `5e46a6de`, `d6073d34`, `aba38e11` remain NULL. Each
falls in a gap between two completed trips, so no trip covers `observed_at` and
there is nothing to associate. This is correct behaviour of the association
layer, not a defect in it.

A `> 5000` RPM firing does prove the engine was running, so these gaps point at
**missed trip detection**, which belongs to
`TripReconciliationService.detectAndRepairMissingTrips` and is out of scope here.
If trip-detection repair later creates trips covering those timestamps, the
Stage 1 delayed sweep will associate these candidates automatically — no further
manual repair is needed.

---

## 11. Read-path impact

`RpmWebhookQueryService.getTripCandidates` selects candidates by
`organization_id + vehicle_id + observed_at BETWEEN trip.start_time AND
(trip.end_time ?? now)`. It does **not** filter on `candidate.trip_id`. This is
why the wrong and NULL links were never visible as missing rows in the UI, and
why Stage 2 hides nothing: the visible set is unchanged, while the `tripId`
field exposed by `rpm-candidate-read-model` is now correct instead of NULL or
wrong.

`getVehicleSummary` and `DataAnalyseService` also scope by vehicle and
timestamp; `DataAnalyseService` does not even select `tripId`. No query in the
codebase assumes `trip_id` is non-null, and none joins through it, so no
consumer could have picked up the stale `CANCELLED` association.

**POST_STAGE2_FOLLOWUP** (not implemented): `getTripCandidates` may now switch to
a direct `trip_id` filter. For the current 12 rows this is behaviour-equivalent,
and it would be strictly more correct for live trips, where the rolling
`end_time` can transiently exclude an event that is already correctly linked. It
should ship with tests rather than as part of a data repair.

---

## 12. Driver-score impact

No driver-score or driving-analysis code path consumes `rpmWebhookCandidate.tripId`.
The only files referencing the model are the association service, the RPM intake
and query services, the DIMO webhook controller, and the data-analyse read model
— none of which feed scoring. `driver-score.service.ts` contains no RPM
reference at all.

Consequences:

- No historical driver score was computed from a wrong or missing association.
- No score recomputation is required, and none was performed.
- No separate score-reconciliation stage is needed at this time.
- The FK is now trustworthy for the future work of feeding high-RPM events into
  driver scoring, which was the forward-looking goal of Stage 1.

---

## 13. Rollback

A row-level rollback record was generated before any write and is stored with the
run artifacts. Restoring the pre-Stage-2 state requires only guarded per-row
updates:

```sql
BEGIN;
UPDATE rpm_webhook_candidates SET trip_id = NULL WHERE id = 'df220be2-134d-4a59-9df6-b52c3a29b41c' AND trip_id = '0dd1f1fe-eeb0-4899-8844-89a0a68c31bc';
UPDATE rpm_webhook_candidates SET trip_id = NULL WHERE id = '92ae500c-c8f8-453c-a5d3-1943b2377cf3' AND trip_id = '683bf86b-256e-46a5-bc81-a048d753bd33';
UPDATE rpm_webhook_candidates SET trip_id = NULL WHERE id = '4b26d57e-7ba6-443e-803c-59fb5f6d5d43' AND trip_id = 'c1886eee-585f-4be9-9724-238b63818377';
UPDATE rpm_webhook_candidates SET trip_id = 'ba613969-577d-4992-b358-09a6022fa75a' WHERE id = '2e6d5e68-2a01-4824-9c11-fd8247a8d493' AND trip_id = '8f88b0de-1df0-439c-85ce-7c70dd6478d2';
UPDATE rpm_webhook_candidates SET trip_id = 'ba613969-577d-4992-b358-09a6022fa75a' WHERE id = 'a114d090-9007-445e-968e-585d41705e66' AND trip_id = '8f88b0de-1df0-439c-85ce-7c70dd6478d2';
UPDATE rpm_webhook_candidates SET trip_id = NULL WHERE id = '6fd26a7d-6bcf-490c-ae5b-5721595682ae' AND trip_id = 'a8508cd1-2d10-4371-8e3b-4c72010f7ea9';
UPDATE rpm_webhook_candidates SET trip_id = NULL WHERE id = '941382ca-cd2b-48a0-b800-56c4c03abfc7' AND trip_id = '61715ecd-b9f7-41eb-a41b-4be852c9eb02';
COMMIT;
```

Rolling back is not recommended: it would restore two associations that point at
a `CANCELLED` trip which never contained the events.

---

## 14. Production health after repair

API health HTTP 200; PM2 online with `unstable_restarts=0`. No restart was
performed or required — the repair was pure row-level data. No Prisma, deadlock,
lock-timeout, scheduler or `EventTripAssociation` errors appeared after the
write. The only errors in the window are the pre-existing `DimoAuthService` 403
for `tokenId=190497` and the pre-existing ClickHouse migration checksum
mismatches, neither related to this work.
