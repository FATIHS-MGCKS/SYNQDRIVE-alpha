# ERD E3 — Telemetry fallback hardening + native/fallback convergence

**Date:** 2026-09-24  
**Workstream:** Energy Event Detection → EV Recharge Detection (E3)  
**Parent main at start:** `5f774791f489a3bbfe6597ff1c945df0b3c5ab48`

## Scope delivered

- Native-first fallback activation (`NATIVE_CAPABLE != NATIVE_EPISODE_PRESENT`)
- Capability-driven fallback detection hardening (multi-signal corroboration, false-positive guards)
- `isCharging` null when `hv.is_charging` capability absent (no false flanks from DB default false)
- Stable fallback start anchor across rolling-window replay
- Pure ERD physical episode matcher: `SAME | AMBIGUOUS | DIFFERENT`
- Deterministic temporal overlap via explicit `evaluatedAt` (no hidden `Date.now()` in matcher)
- Fail-closed supersession (no mass temporal supersede)
- Atomic late-native convergence transaction (`pg_advisory_xact_lock` + single TX)
- Bounded E3 observability counter `synqdrive_erd_e3_convergence_total{reason}`

## E3.1 addendum (same PR #1747)

- **Shared authority lock:** `erd-hv-charge-session-authority.lock.ts` — one `pg_advisory_xact_lock(hashtext(vehicleId))` for all native + fallback physical writes
- **Native:** removed unlocked `persistDraftOutsideTx`; every native upsert re-reads fallback + matcher under lock
- **Fallback:** `persistProvisionalFallbackUnderAuthorityLock` re-validates native-first + matcher-based identity reuse
- **Identity rule:** `PERSISTED_START_ANCHOR_AND_FINGERPRINT_IMMUTABLE` — earlier-start replay cannot mint second fingerprint
- **Postgres:** independent PrismaClient A/B race matrix (native-first, fallback-first, concurrent fallback, replay, rollback)

## Out of scope (unchanged)

- Production flag activation
- E4 scheduler/recovery ownership
- E5 VehicleEnergyEvent cutover
- E6 charging-station enrichment
- Customer UI/API

## Validation

- Unit: matcher, activation, policy, capability routing, reconcile wiring
- PostgreSQL gate: `ERD_E3_POSTGRES_INTEGRATION=1` → `hv-fallback-native-convergence.postgres.integration.spec.ts`
- CI: `backend/scripts/test/boundary-repair-postgres-ci.sh` step 5

## Invariants

- One physical charge → one canonical session (native supersedes fallback; superseded fallback not counted as canonical)
- Native over fallback; capability-driven authority preserved
