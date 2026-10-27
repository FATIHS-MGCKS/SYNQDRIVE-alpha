# Rental Health — Architecture Authority (bootstrap, `AUDIT_IN_PROGRESS`)

Living architecture authority for **Rental Health**: fleet-level health aggregation consuming source vehicle health modules **without recalculating** them.

| Field | Value |
|-------|-------|
| Registry coverage status | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-10-28 — DS4 authority migration PR-0) |
| Authority-native status | Bootstrap V0.1 |
| DS4 migration | Indirect — consumes tire/brake/vehicle health summaries; must not ingest DS4 shadow tables directly |

## Entry documents (partial)

1. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md)
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`AGENT_CONTRACT.md`](AGENT_CONTRACT.md)
4. [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md)
