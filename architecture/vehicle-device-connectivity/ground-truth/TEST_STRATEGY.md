# Vehicle & Device Connectivity — Ground-Truth Test Strategy

**Status:** Methodology only — **no destructive or mutation-based tests** in bootstrap Phase 0.

## Principles

1. **Source time ≠ poll time** — ground truth uses monotonic `sourceTimestamp` / `lastSeen`, not `providerFetchedAt`.
2. **Multi-source corroboration** — trips, episodes, raw payloads, ClickHouse, poll logs.
3. **Per-provider profiles** — LTE_R1 first; HM later.
4. **Read-only Production forensics** by default; controlled physical tests only with explicit authorization.

## Target scenarios

| Scenario | Primary evidence | Notes |
|----------|------------------|-------|
| Normal driving | High-frequency distinct `recorded_at` in CH; ignition/motion state changes | Baseline cadence |
| Ignition off | Last moving + ignition-off alignment | End of active phase |
| Prolonged parking | Source silence duration; standby wakes | Tolerance calibration |
| Expected standby source update | New `lastSeen` without trip | VDC-HYP-001 |
| OBD/R1 physically unplugged | `obdIsPluggedIn`, device connection episodes/webhooks | Physical fault class |
| R1 plugged back in | New strict source advance + plug signal after unplug | **PHYSICAL_REPLUG** + optional **TELEMETRY_RESUMED** — not **FULL_CONNECTIVITY_RECOVERED** unless all dimensions align |
| LTE/network loss | Provider vs device divergence | If observable |
| Provider/API outage | Poll failures vs stale success | VDC-HYP-006 |
| DIMO permission/auth failure | Consent/link status vs telemetry | Separate from sleep |
| Stale cached provider data | Poll success + unchanged `lastSeen` | VDC-HYP-003 |
| Fresh source after long silence | Monotonic `lastSeen` jump | Standby wake |
| Native event without full snapshot | Webhook/RPM candidate without CH row | Trip wake neighbor |
| Fresh snapshot without webhook | CH row without inbox event | Scheduler path |
| Hardware suspected defective | Sustained absence beyond profile tolerance | Fault class |
| Recovery after known disconnect | State transition with fresh source | VDC-HYP-007 |

## Execution gates

| Gate | Requirement |
|------|-------------|
| G1 | Vehicle identified; tenant-scoped read-only queries only |
| G2 | Analysis window documented (UTC + Europe/Berlin) |
| G3 | Deduplicated source timeline (ClickHouse + Postgres) |
| G4 | Hypothesis matrix updated with CONFIRMED / CONTRADICTED |
| G5 | Evidence committed with `VDC-EVID-*` IDs |

## Prohibited in Phase 0

- Production mutations, deploys, restarts
- Synthetic Production records
- Promoting chat-derived numbers without reconstruction
