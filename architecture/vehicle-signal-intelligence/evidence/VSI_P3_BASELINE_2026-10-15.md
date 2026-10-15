# VSI P3 baseline — repository vs production (2026-10-15)

| Field | Value |
|-------|-------|
| **Epistemic** | CONFIRMED (repository) · Production DB metrics **UNKNOWN** (read-only SQL blocked) |
| **Main SHA** | `3a7cc0cc34ab5e79781ae667b8b6c68637a70c8f` |
| **Production deploy SHA** | `3a7cc0cc3` (SSH `synqdrive-admin@srv1374778.hstgr.cloud` `/opt/synqdrive/current`) |
| **P2 lifecycle migration on production** | **UNKNOWN** — `DATABASE_URL` not usable from admin shell (local socket / role mismatch) |
| **P2 worker runtime** | **UNKNOWN** — not inspected on VPS in this workstream |

## Repository evidence (confirmed)

- P0+P1 profiles: `vehicle_signal_capability_profiles` + materialization service on `main`.
- P2 lifecycle artifacts present in repository (outbox, worker); merge/deploy status not asserted here.
- VSI03 observation ledger available for **bundle-level** `providerSourceTimestamp` history (not per-signal payload history).

## Historical evidence sources (P3 audit)

| Source | Proves | Limitation |
|--------|--------|------------|
| `vehicle_driving_capabilities` / `vehicle_battery_capabilities` | DIMO `availableSignals` preflight (declared) | Vehicle-scoped; ambiguous with multi active link |
| `vehicle_latest_states` | Latest empirical sample per vehicle | Single row — **not** a timeline |
| `vehicle_provider_source_observations` | Bundle fetch + source timestamp sequence | No per-signal payload retention |
| `dimo_poll_logs` | API poll attempts | **Not** transmission cadence |
| VSI03 capture ledger | Optional forensic strict-advance continuity | Feature-flagged; not required for P3 |
| ClickHouse / HF mirrors | Not wired into profile materialization in this PR | Gap — future with provenance contract |

## Gaps explicitly recorded

- Full DIMO `availableSignals` inventory is **not** persisted as a normalized per-link catalog snapshot.
- Per-signal historical timelines require observation ledger enrichment or approved analytical store — absent values surface as `INSUFFICIENT_HISTORY` / honest cadence nulls.
- Production profile counts and outbox backlog **not sampled** (DB access blocked).
