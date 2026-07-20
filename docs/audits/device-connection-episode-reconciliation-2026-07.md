# Device Connection Episode Reconciliation Audit — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `device-connection-episode-reconciliation-2026-07` |
| **Mode** | **READ_ONLY** — no production data modified |
| **Generated** | 2026-07-19T12:00:00.000Z |
| **Organization scope** | FIXTURE_SCOPE |
| **Vehicle scope** | all |

## Summary

| Metric | Count |
|--------|------:|
| Episode candidates | 8 |
| Apply-eligible (HIGH confidence) | 1 |
| Review required | 5 |

### By classification

| Classification | Count |
|----------------|------:|
| OPEN_CONFIRMED | 2 |
| RESOLVED_EXPLICIT | 1 |
| SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL | 0 |
| SHOULD_RESOLVE_BY_TELEMETRY | 1 |
| SUPERSEDED_BY_BINDING_CHANGE | 1 |
| OUT_OF_ORDER | 1 |
| DUPLICATE | 1 |
| CONFLICTING_DATA | 0 |
| NOT_ENOUGH_DATA | 1 |

## Method

- Reconstructs canonical unplug episodes from the **full** `DimoDeviceConnectionEvent` history.
- Evaluates snapshot (`obdIsPluggedIn`, provider/received timestamps), telemetry, trips, bindings, and alerts.
- **Does not** write episodes, mutate events, or apply resolutions.
- Uncertain cases remain `reviewRequired` with `applyEligible=no`.

## Artifacts

- Machine-readable: `docs/audits/data/device-connection-episode-reconciliation-2026-07.csv`

## Candidate overview

| Vehicle | Classification | Confidence | Apply | Conflicts |
|---------|----------------|------------|-------|-----------|
| FIXTURE_INCIDENT_001 | SHOULD_RESOLVE_BY_TELEMETRY | HIGH | yes | SNAPSHOT_NOT_PLUGGED |
| FIXTURE_EXPLICIT_PLUG_002 | RESOLVED_EXPLICIT | HIGH | no | — |
| FIXTURE_STALE_SNAPSHOT_003 | OPEN_CONFIRMED | MEDIUM | no | SNAPSHOT_OBSERVED_BEFORE_UNPLUG; TELEMETRY_NOT_SUSTAINED |
| FIXTURE_OEM_TELEMETRY_004 | NOT_ENOUGH_DATA | LOW | no | NON_PHYSICAL_OBD_BINDING; OEM_OR_SYNTHETIC_NO_OBD_CLOSURE |
| FIXTURE_BINDING_CHANGE_005 | SUPERSEDED_BY_BINDING_CHANGE | MEDIUM | no | — |
| FIXTURE_DUPLICATE_006 | DUPLICATE | HIGH | no | — |
| FIXTURE_OUT_OF_ORDER_007 | OUT_OF_ORDER | HIGH | no | PLUG_BEFORE_UNPLUG |
| FIXTURE_UNRESOLVED_008 | OPEN_CONFIRMED | HIGH | no | SNAPSHOT_NOT_PLUGGED; NO_TELEMETRY_AFTER_UNPLUG |

## Apply guidance (future controlled run)

Only rows with `applyEligible=yes` and `confidence=HIGH` are candidates for a later
controlled backfill. All other rows require manual review before any write path.
