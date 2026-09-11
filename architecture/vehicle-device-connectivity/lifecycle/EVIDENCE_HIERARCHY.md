# Vehicle & Device Connectivity — Evidence Hierarchy (Current Code)

**Phase 1:** documents what code **uses today** — not final canonical ranking.

## Evidence classes

| Class | Source in code | Used for | Precedence notes |
|-------|----------------|----------|------------------|
| Fresh source timestamp | VLS `source_timestamp` | Telemetry freshness #1 | Monotonic guard |
| Individual signal timestamp | `raw_payload_json` signals | AI evidence, forensics | May lag `lastSeen` (VDC-HYP-004) |
| Provider fetch success | VLS `providerFetchedAt` | Diagnostic reachability only | Updated on stale skip |
| Provider connectionStatus | `dimo_vehicles.connection_status` | Read-model anchor, recovery evaluator | Not sole freshness |
| Physical OBD plugged | `obdIsPluggedIn` in snapshot | Physical device inference | Tie-break vs webhooks |
| Provider webhook (plug/unplug) | `dimo_device_connection_events` | Episodes, physical evidence | Ordered by `observed_at` |
| Device connection episode | `device_connection_episodes` | Unplug lifecycle, alerts | Open episode ≠ only unplug path |
| Speed/ignition webhook | DIMO webhook → snapshot wake | Trip wake (Trip Detection) | Does not prove fresh snapshot |
| Latest snapshot bundle | VLS row | Runtime assembly | Single latest row only |
| Poll success | `dimo_poll_logs` SUCCESS | Ops attention (6h), forensics | ≠ new source data |
| HTTP/API availability | Provider gateway errors | Provider link ERROR | |
| Signal coverage % | Computed in builder | Data coverage dimension | ≥80/≥50 thresholds |
| Consent/authorization expiry | IAM tables | Provider link state | Precedence before ACTIVE |
| Binding change events | Device binding lifecycle | Alerts, episode scope | |

## Current precedence chains

### Telemetry observation instant

`telemetry-freshness.resolver.ts` priority chain (see [../signals/FRESHNESS_SEMANTICS.md](../signals/FRESHNESS_SEMANTICS.md)).

**Reduced path:** `vehicles-operational.service.ts` `resolveRowTelemetry()` uses only `lastSignal` + `last_seen_at` (VDC-GAP-010).

### Physical device

`physical-device-evidence.ts`: newest timestamp wins; tie-break `positive_plug > negative_unplug > negative_snapshot > positive_snapshot`.

### Overall connectivity

`connectivity-domain.priority.ts` numeric ranks — integration error beats auth beats unplug beats offline beats soft offline.

### Provider link

`provider-link-state.builder.ts` 10-step chain — cross-tenant mismatch → ERROR → … → ACTIVE.

## Inconsistencies (not resolved)

- Poll success vs source advance (VDC-HYP-003, VDC-HYP-007)
- `providerFetchedAt` freshness vs `sourceTimestamp` freshness
- Episode absent vs physical unplug evidence (VDC-CX-007)
- Webhook failure reason vs provider link ERROR (VDC-CX-008)
