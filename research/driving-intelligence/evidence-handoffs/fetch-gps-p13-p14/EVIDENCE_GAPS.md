# Evidence Gaps — Fetch GPS P13/P14 Handoff

## Critical missing (blocks full pairwise replay)

| Gap | Status | Impact |
|-----|--------|--------|
| Persisted P13 `cloudEvents` (limit 5) JSON | **ABSENT** | Cannot recover event IDs, raw `data.pos` types, or exact coordinates |
| Persisted P14 `cloudEvents` (limit 30) JSON | **ABSENT** | Cannot reproduce 30 original Fetch coordinates or recompute haversine without new Fetch |
| `P14 pairs[]` export at execution time | **NOT_CAPTURED** | Only aggregate mean ~1014 m in report |
| CloudEvent `header.id` in handoff | **NOT STORED** in reports (intentionally withheld at execution) |
| `raweventid` | Reported **0/5** and **0/30** present in samples | Weak upstream identity chain |
| Telemetry measurement time on GraphQL path | P1: `ORIGINAL_MEASUREMENT_TIMESTAMPS_AVAILABLE=NO` | Cannot prove physical co-time with Fetch header |

## Available substitutes (not raw)

- Agent completion JSON in `reports/` (derived summaries).
- `P14_JOIN_SPEC.json` (reconstructed join methodology).
- Sealed S4 position pin in monorepo (contains coordinates — **do not republish**; use SHA + local path only in git handoff).

## Tier B transfer

**RAW_DATA_TRANSFER_PENDING** — see `/opt/cursor/artifacts/ds4-fetch-gps-tier-b-local-only/README.md` on the originating Cloud Agent VM (not committed). Owner must authorize secure transfer if raw CloudEvents are re-fetched or recovered from another store.

## Recommended owner action

Explicit **Tier-B Fetch export** operation with persistence requirement before any GPS root-cause study claims per-event causality.
