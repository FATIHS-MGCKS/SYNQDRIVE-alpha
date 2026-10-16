# EXP021 EV Ground Truth — forensic supplement v2

**Observed at (UTC):** `2026-10-16T16:34:32.031Z`  
**Additive export:** does not modify `forensic-readonly-exports-2026-10-16/`, `forensic-readonly-exports-2026-10-16-supplement-v1/`, or `pre-deploy/`.

## Summary flags

| Flag | Value |
|------|--------|
| REJECTED_INPUT_EXPLAINS_GAPS | NO |
| SEGMENT_SOURCE_EVIDENCE | CLICKHOUSE_EMPTY_FOR_WINDOW |
| POST_DEPLOY_ADMISSION | ADMISSION_RECORD_MISSING |
| CURRENT_PROJECTION_READABLE | CURRENT_ROW_EXISTS_PRODUCT_READ_BLOCKED |
| NEXT_JUSTIFIED_EXPERIMENT | Provider/cache row-level forensics for ROW_ABSENT bucket labels (outside pinned snapshot) without algorithm change |

## Priority 1 — missing vs rejected input

- Full `rejectedProviderRows` exported in `POSITION_SNAPSHOT_INPUT_AUDIT_SUPPLEMENT_V2.json`.
- `providerSignalsNull`: false
- Sum `providerRowCount` across buckets: 867
- Quality flags: (none)
- Among **135** annotated tacho-zero seconds: **133** ROW_ABSENT; **0** with rejected input for same label; **133** without.

## Priority 2 — segment source

See `TRIP_SEGMENT_CANDIDATES_SUPPLEMENT_V2.json`.

## Priority 3 — post-deploy (separate from pre-deploy)

Committed capture referenced from `post-deploy/`; live read in `POST_DEPLOY_STATE_SUPPLEMENT_V2.json`.
