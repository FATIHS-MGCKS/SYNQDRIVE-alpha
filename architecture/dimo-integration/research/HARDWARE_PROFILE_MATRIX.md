# R2 — Hardware profile matrix

| Profile | Evidence in repo | Typical DIMO path | Notes |
|---------|-----------------|-------------------|-------|
| **Ruptela LTE R1** | LTE R1 manifests, KS MS 661 R9 wakes | Webhooks + 30s snapshot tier | Native `behavior.*` events in Phase 2F |
| **Smart5** | Phase 2F strategy doc | Snapshot + segments | Native events often empty |
| **Tesla/OEM** | Battery V2 G5B, reference capture | signalsLatest HV fields | Observation freshness critical |
| **Generic OBD** | DTC, OBD plug webhooks | Q005 + connectivity | RPM webhook legacy |

R2 does **not** re-run per-vehicle signal matrices — see `docs/audits/dimo-phase-2f-*` and manifests.

## Capability-first query shaping

| Status | Evidence |
|--------|----------|
| **Design / planned** | Phase 2F acquisition tiers T0–T6 |
| **Implemented in production queries** | **NO** — static Q001 field list (`SIGNAL_CAPABILITY_CATALOG.md`) |
