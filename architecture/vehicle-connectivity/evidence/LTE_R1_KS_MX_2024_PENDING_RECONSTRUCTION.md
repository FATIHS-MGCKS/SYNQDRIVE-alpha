# LTE_R1 — KS MX 2024 — Production Observation (Pending Reconstruction)

| Field | Value |
|-------|-------|
| **Evidence ID** | VC-EVID-LTE-R1-PENDING-001 |
| **Source type** | `PRODUCTION_OBSERVATION_PENDING_RECONSTRUCTION` |
| **Epistemic status** | `INFERRED` (chat/session notes — **not** canonical) |
| **Validation status** | `PROPOSED` — requires independent Phase 2 audit |
| **Vehicle** | Mercedes-Benz C 63 AMG, license plate **KS MX 2024** |
| **Hardware** | `LTE_R1` |
| **DIMO token ID** | 187336 |
| **Vehicle ID** | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |

## Purpose

Preserve research direction from a prior **read-only** forensic session without promoting unverified numbers to canonical authority facts.

## Pending observations (require independent verification)

| Observation | Classification | Notes |
|-------------|----------------|-------|
| Last active trip source timestamp ~ `2026-09-08 05:02:15 UTC` | INFERRED | Align with trip/ignition-off reconstruction in Phase 2 |
| Subsequent distinct source timestamps ~ every **24 hours** | INFERRED — **STRONGLY SUPPORTED** pending reconstruction | Candidate gaps ~86.5k s; **not** confirmed 6h / 21.600 s |
| SynqDrive polling much more frequent than new provider source timestamps | INFERRED | Compare `dimo_poll_logs` vs unique `source_timestamp` / ClickHouse deduped `recorded_at` |
| `signalsLatest` path does not expose Ruptela IO174 directly | INFERRED | Does not prove IO174 absent on device |
| Historical per-wake raw payload retention incomplete | INFERRED | VLS latest-only limits per-signal forensics |
| ~24h periodic standby source update | INFERRED — hypothesis VC-HYP-001 | Falsify with multi-day Production timeline |

## Explicit non-claims

- IO174 sleep-timer wake **confirmed**
- Ruptela 0x10 heartbeat **observed**
- Exact gap jitter values as canonical constants
- 6-hour (21.600 s) standby interval

## Phase 2 reconstruction checklist

- [ ] Re-verify vehicle identity (KS MX 2024 vs requested KS MX 2023 label)
- [ ] Deduplicated ClickHouse `telemetry_snapshots` timeline
- [ ] `dimo_poll_logs` vs genuine `source_timestamp` counts
- [ ] Monotonic-guard log sampling (if retained)
- [ ] Latest `raw_payload_json` per-signal timestamps at each wake
- [ ] Cross-check with trip detection state and device connection episodes
