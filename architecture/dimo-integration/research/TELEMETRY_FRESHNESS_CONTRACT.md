# R2 — Telemetry freshness contract

## Terms (non-interchangeable)

| Term | Meaning |
|------|---------|
| **Scheduler tick** | Wall clock between `DimoSnapshotScheduler` runs (Production: 30s) |
| **Tier poll interval** | Minimum time between snapshot jobs per vehicle (30s–30m) |
| **GraphQL bucket** | `signals(interval:…)` aggregation requested by SynqDrive |
| **Provider sample time** | Timestamp on signal/bucket from DIMO |
| **SynqDrive receipt** | `providerFetchedAt`, RP-039 `synqReceivedAt` on timed queries |
| **VLS monotonic merge** | `shouldApplyVlsTelemetryUpdate` suppresses regressions |

## Consumer rules (CONFIRMED patterns)

| Consumer | Freshness gate |
|----------|----------------|
| Battery V2 customer HV | Source-observation freshness (G5B) |
| Trip FSM | Activity signals + segment boundaries |
| Fleet map | VLS `lastSeen` / location fields |
| Capability preflight | 7-day gate in DI service — **does not** gate Q001 |

## Stale hardware

LTE R1 may report infrequently while SynqDrive polls every tier interval — **CONFIRMED architectural risk** (Phase 2A). `availableSignals` ≠ fresh samples.

## Production @ R2

Activity-tier polling **enabled**; tier override env **not** set — defaults apply.
