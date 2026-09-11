# Provider Profile — DIMO · Ruptela LTE_R1

| Field | Value |
|-------|-------|
| **Profile ID** | VDC-PROF-LTE-R1-001 |
| **Provider** | DIMO |
| **Hardware** | Ruptela LTE_R1 (`vehicles.hardware_type = LTE_R1`) |
| **Epistemic status** | PRODUCTION_OBSERVATION (KS MX 2024 Phase 2) |
| **Validation status** | PRODUCTION_VALIDATED (single-vehicle forensics) |

## Production-validated behaviors (KS MX 2024 — token 187336)

| Topic | Observation | Classification |
|-------|-------------|----------------|
| Standby source cadence | ~24 h strict source advances (86,563–86,581 s observed) | PRODUCTION_OBSERVATION |
| 6 h standby cadence | **Not observed** | CONTRADICTED for this vehicle |
| Poll vs source | ~343:1 SUCCESS poll : strict advance during stationary window | PRODUCTION_OBSERVATION |
| 24 h threshold windows | +163 to +181 s **potential** classification windows; Sep cycles: 0 SNAPSHOT in exact windows, 0 persisted SOFT_OFFLINE, runtime evaluation **not proven** | PRODUCTION_OBSERVATION |
| Unplug delivery vs canonicalization | Provider inbox ~4 s; SynqDrive canonicalization ~100 min (Aug 2026, `enqueue_failed`; later processing consistent with scheduler retry path) | PRODUCTION_OBSERVATION |
| Per-signal timestamps | Fuel/ECT may remain at trip-end while LV/GNSS advance on wake | PRODUCTION_OBSERVATION |
| IO174 / Ruptela raw IO | Not exposed in `signalsLatest` ingest | IO174_NOT_EXPOSED_BY_CURRENT_INGEST |
| Heartbeat / 0x10 | Not observed in SynqDrive persistence | UNKNOWN at protocol layer |
| Unplug/plug | Aug 2026 unplug webhooks; recovery via snapshot plug signal without plug webhook | PRODUCTION_OBSERVATION |
| Healthy sleep signature | CONNECTED + plugged + standby + stale source + fresh `providerFetchedAt` | PRODUCTION_OBSERVATION |

## Canonical case vehicle

**Primary:** [../../evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](../../evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md)

**Historical placeholder (superseded):** [../../evidence/LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md](../../evidence/LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md)

## Open research (not proven)

- Ruptela IO174 sleep-timer physical wake
- Ruptela 0x10 heartbeat as distinct from ~24 h `lastSeen` advance
- Fleet-wide gap distribution across all LTE_R1 vehicles
- Secondary control vehicle for standby jitter replication

## Neighbor ownership

Acquisition and normalization: [DIMO Integration](../../../dimo-integration/README.md).
