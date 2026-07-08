# Trip Detail — Read-only ClickHouse Evidence (2026-07-08)

## Scope (V4.9.262)

Trip Detail (`GET /vehicles/:vehicleId/trips/:tripId`) optionally returns
`clickhouseEvidence` — read-only analytics context from ClickHouse. Canonical
trip scores and misuse decisions remain in PostgreSQL / HF enrichment.

## Service

`TripEvidenceReadService.getTripClickHouseEvidence()` composes:

- `SignalQualityReadService` (HF windows/points quality)
- Snapshot count in trip time window (`telemetry_snapshots`)
- HF event count (`telemetry_hf_events`)
- GPS / RPM / throttle / engine-load availability from window stats
- Evidence summary bullets (German, no score language)

## API field `clickhouseEvidence`

| Field | Purpose |
|-------|---------|
| `evidenceAvailable` | Any CH layer has trip-scoped data |
| `clickhouseStatus` | available / degraded / unavailable / mirror_disabled |
| `signalQuality` | good / medium / weak / unavailable (evidence only) |
| `evidenceSummary` | Operator bullets e.g. „RPM-Daten verfügbar“ |
| `detectorFeasibility` | Read-only hints from hf-abuse feasibility |
| `degraded` | CH down or partial — Trip Detail still works |

## UI

`TripClickHouseEvidenceBlock` in `TripEvidencePanel` — collapsible, subtle,
no Data Analyse UX clone.

## Safety

- Never throws on CH outage
- `HF_MIRROR_ENABLED=false` → `mirror_disabled` status, trip loads normally
- No scores written to or read as canonical from ClickHouse
