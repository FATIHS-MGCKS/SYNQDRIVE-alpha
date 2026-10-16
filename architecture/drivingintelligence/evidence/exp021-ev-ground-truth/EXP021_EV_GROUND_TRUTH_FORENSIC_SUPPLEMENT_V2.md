# EXP021 EV Ground Truth — forensic supplement v2

**Observed at (UTC):** `2026-10-16T16:34:32.031Z` (see export dir for exact regeneration time)  
**Additive:** does not modify `forensic-readonly-exports-2026-10-16/`, `forensic-readonly-exports-2026-10-16-supplement-v1/`, or `pre-deploy/`.

## Summary flags

| Flag | Value | Epistemic |
|------|--------|-----------|
| `REJECTED_INPUT_EXPLAINS_GAPS` | **NO** | CONFIRMED — pinned POSITION snapshot has **zero** `rejectedProviderRows`; among 135 tacho-zero seconds, **133** are `ROW_ABSENT` with **no** rejected label for the same bucket |
| `SEGMENT_SOURCE_EVIDENCE` | **CLICKHOUSE_EMPTY_FOR_WINDOW** | CONFIRMED — read-only `CLICKHOUSE_URL` HTTP on Production (`trip_segment_candidates` for acquisition window); **0** rows; `dimo_segment_id` remains Postgres-only `dimo-seg-186946-1792121760000` |
| `POST_DEPLOY_ADMISSION` | **ADMISSION_RECORD_MISSING** | CONFIRMED — live read + committed `post-deploy/` manifest agree |
| `CURRENT_PROJECTION_READABLE` | **CURRENT_ROW_EXISTS_PRODUCT_READ_BLOCKED** | CONFIRMED — CURRENT V2 row exists; product read gate blocked on admission |
| `NEXT_JUSTIFIED_EXPERIMENT` | Provider/cache row-level forensics for `ROW_ABSENT` bucket labels (outside pinned snapshot), no algorithm change | INFERRED |

## Priority 1 — missing vs rejected input

Exported from pinned S4 POSITION channel (`parseDiV0PositionSnapshot`):

- `rejectedProviderRows`: `[]` (full list in JSON)
- `providerSignalsNull`: `false`
- Sum of bucket `providerRowCount`: **867**
- Acquisition window: `2026-10-16T03:36:00.000Z` → `2026-10-16T03:54:56.000Z` (exclusive grid end)
- Label convention: 1s DIMO historical bucket labels (`timestamp`), `FROM_INCLUSIVE_TO_EXCLUSIVE`

**Interpretation (CONFIRMED):** For annotated tacho-zero seconds classified `ROW_ABSENT`, normalization had **no** matching provider row in the snapshot material **and** no rejected row for that label. That is **missing input at S3A for those grid cells**, not discarded input. It is **not** proof of physical sensor outage or total provider failure.

## Priority 2 — segment source

- Docker socket **not** available to `synqdrive-admin` on VPS (blocker for `clickhouse-client` via docker exec).
- **Successful** read-only path: `CLICKHOUSE_URL` HTTP (`curl` on VPS with `backend.env` credentials).
- Result: empty candidate set for the trip window (see `TRIP_SEGMENT_CANDIDATES_SUPPLEMENT_V2.json`).

## Priority 3 — post-deploy (isolated)

- Committed capture: `post-deploy/POST_DEPLOY_BASELINE_MANIFEST.json` (unchanged).
- Additive live read: `POST_DEPLOY_STATE_SUPPLEMENT_V2.json`.

## Artifacts

| Path | Role |
|------|------|
| [forensic-readonly-exports-2026-10-16-supplement-v2/](./forensic-readonly-exports-2026-10-16-supplement-v2/) | JSON + `SHA256SUMS` |
| `npm run exp021:ev-ground-truth:forensic-supplement-v2` | Regenerate (read-only) |
