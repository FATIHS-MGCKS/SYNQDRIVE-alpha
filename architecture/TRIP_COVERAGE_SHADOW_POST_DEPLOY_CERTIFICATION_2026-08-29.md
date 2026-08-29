# Trip Coverage Shadow — Post-Deploy Production Certification (2026-08-29)

**Scope:** PR #1401 (trip-start isolation) + PR #1403 (containment-aware overlap, shadow mode)  
**Method:** READ-ONLY inspection of live VPS, PostgreSQL, ClickHouse, PM2 logs, deployed `dist/`  
**Verdict:** **B — FUNCTIONAL BUT OBSERVATION WINDOW INSUFFICIENT**

---

## Deployment identity

| Field | Value |
|-------|-------|
| Production SHA | `ea65d8b7079ff4948c8e16a70952a9b151c2211b` |
| Release dir | `/opt/synqdrive/releases/20260828235349_v4994` |
| Deploy timestamp | 2026-08-28 23:53:49 UTC (symlink updated 23:54:17 UTC) |
| Process | PM2 `synqdrive` pid 1250634, started 2026-08-29 00:01:16 UTC |
| Uptime at audit | ~47 minutes |
| PM2 restarts (lifetime) | 9 (unstable_restarts=0) |
| API health | `{"status":"ok"}` |

**PR #1401 deployed:** YES — `dimo-snapshot.processor.js` contains `Resolution outbox drain failed` catch + `UnrecoverableError` re-throw.  
**PR #1403 deployed:** YES — `trip-coverage.util.js`, `trip-overlap.detector.js`, `trip-reconciliation.service.js`, `normalizeCoverageMode` present in `dist/`.

Ancestor chain on `main`: `ea65d8b70` → `5c31c4121` (#1403) → `272ccdf25` (#1401) → `c1990f98b` (#1398).

---

## Runtime mode

| Check | Result |
|-------|--------|
| `TRIP_REPAIR_COVERAGE_MODE` in `/opt/synqdrive/shared/backend.env` | **ABSENT** |
| PM2 process env override | **NONE** |
| `normalizeCoverageMode` on deployed dist | `undefined`/`''`/invalid → `shadow`; only explicit `enforce`/`legacy` change mode |
| `PRODUCTION_ENFORCE_ACTIVE` | **NO** |
| `COVERAGE_MODE_PRODUCTION` | **SHADOW** |

---

## Shadow / legacy parity (deployed code)

Authoritative persistence branch in production `dist`:

```javascript
const suppress = mode === 'enforce' ? coverageSuppresses : legacySuppresses;
// reconciliation:
const acceptedSpans = coverageMode === 'enforce' ? repairableSpans : [fullCandidate];
```

With absent env → `shadow` → **legacy verdict alone drives suppression and trip creation**.

---

## Coverage invariant (production data, read-only)

Offline replay harness against production TSV export (`/tmp/tdh_export`, SELECT-only extracts):

- candidates checked: **10071**
- legacy accepts: **470**
- coverage would suppress on legacy-accepted: **0**

`INVARIANT_VIOLATIONS = 0`

Live `trip_repairs.detector_evidence.overlapDecision` rows since deploy: **0** (reconciliation not yet exercised post-deploy).

---

## Shadow observability since deploy

| Metric | Count |
|--------|------:|
| `trip_repairs` created | 0 |
| `SUPPRESSED` rows | 0 |
| `overlapDecision` records | 0 |
| New trips | 0 |
| ClickHouse snapshots since deploy | 0 vehicles / 0 rows |
| ClickHouse state_changes since deploy | 0 vehicles / 0 rows |

Pre-deploy `trip_repairs` rows carry `dimoSegment` evidence only (no `overlapDecision` key) — expected; schema is Json, no migration required.

---

## PR #1401 runtime

- Catch boundary verified in deployed `dist`.
- No `Resolution outbox drain failed` log lines since deploy.
- No trip/snapshot fatal errors in PM2 error log since deploy.
- **PR_1401_RUNTIME_HEALTH:** `NOT_EXERCISED` (no outbox fault and no fleet telemetry since deploy).

---

## Reconciliation / repair path

- No reconciliation log lines since deploy (`TripReconciliation`, `Missing trip repaired`, etc.).
- **RECONCILIATION_HEALTH:** `NOT_EXERCISED`
- No migrations since deploy (`_prisma_migrations` count = 0 after 23:50 UTC).
- **BACKFILL_STARTED:** NO

---

## Performance (read-only EXPLAIN)

Sample vehicle `68868291-…` (1902 trips): overlap-shaped query uses `vehicle_trips` scan with `vehicle_id` filter, `LIMIT 201`, execution **1.37 ms**, 402 buffers. Composite index `vehicle_trips_vehicle_id_start_time_idx` exists. Vehicle-scoped, bounded — no fleet-wide scan introduced by #1403.

---

## Unauthorized mutations

None detected. Zero bulk trip rewrites, zero post-deploy migrations, zero `trip_repairs` writes attributable to shadow deployment.

---

## RPM sentinels (five design sentinels, read-only)

| ID | Vehicle | RPM time | Nearby canonical trips | Shadow persistence |
|----|---------|----------|------------------------|--------------------|
| 79c4f647 | 8c850ff1 | 2026-07-18 12:41 | 0 | Legacy-controlled; gap still visible |
| d9197e1f | 8c850ff1 | 2026-07-19 07:28 | 0 | Legacy-controlled; gap still visible |
| 5e46a6de | 8c850ff1 | 2026-07-20 06:47 | 3 | Legacy-controlled; confidence gate still blocks in shadow |
| d6073d34 | 19fedd4b | 2026-07-20 06:50 | 2 | Legacy-controlled |
| aba38e11 | 19fedd4b | 2026-07-20 06:53 | 2 | Legacy-controlled |

Replay on production TSV confirms coverage would expose gaps; enforce remains off; PR B/C still required for pairing/confidence fixes.

---

## Summary block

```
PRODUCTION_SHA = ea65d8b7079ff4948c8e16a70952a9b151c2211b
PR_1401_DEPLOYED = YES
PR_1403_DEPLOYED = YES
COVERAGE_MODE_PRODUCTION = SHADOW
PRODUCTION_ENFORCE_ACTIVE = NO
SHADOW_LEGACY_PARITY = YES
COVERAGE_INVARIANT_PASS = YES
INVARIANT_VIOLATIONS = 0
NEW_SHADOW_AUDIT_ROWS = 0
NEW_TRIPS_SINCE_DEPLOY = 0
NEW_TRIP_GAPS_SINCE_DEPLOY = NOT_EXERCISED
PR_1401_RUNTIME_HEALTH = NOT_EXERCISED
RECONCILIATION_HEALTH = NOT_EXERCISED
BACKFILL_STARTED = NO
UNAUTHORIZED_PRODUCTION_MUTATIONS = NONE
FIRST_BROKEN_BOUNDARY = NONE
FINAL_VERDICT = B
```

**Recommendation:** Continue shadow observation for **minimum 7 days** with normal fleet activity. Watch for first `overlapDecision.mode = "shadow"` rows and confirm `INVARIANT_VIOLATIONS` stays 0. **DO NOT ENABLE ENFORCE.**
