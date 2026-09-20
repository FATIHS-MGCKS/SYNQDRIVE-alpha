# EED RFRF F10.6.8-B — Durable candidate recovery

Date: 2026-09-20

## Summary

Adds candidate-centric durable recovery for existing non-terminal `RawRefuelCandidate` rows:

- `computeRawRefuelCandidateRecoveryWindow` (evidence-anchored, bounded)
- `detectRawFuelRisesForPersistedSignalChannel` (recovery-only channel lock)
- `RawRefuelCandidateService.reconcileExistingCandidateById` (no insert path)
- PostgreSQL recovery fields + `FOR UPDATE SKIP LOCKED` claim batch
- `RawRefuelCandidateRecoveryService` + `RawRefuelCandidateRecoveryScheduler`
- Gate: `RAW_FUEL_REFUEL_FALLBACK_ENABLED` + `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` + `RFRF_CANDIDATE_RECOVERY_ENABLED` (default false)

## Authority firewall

Recovery never invokes promotion, G2 handoff, or fallback `VehicleEnergyEvent` creation.

## F10.6.8-B1 closure (2026-09-20)

### Root cause — CI TypeScript failure

`RawFuelRefuelFallbackConfig` gained four F10.6.8-B fields. Explicit test `withConfigLoader(() => ({ masterEnabled, persistEnabled, cutoverAt }))` literals no longer satisfied the interface, breaking backend `tsc` and cascading into Stage-3/4 operational tooling gates.

### Fix

- Added `defaultRawFuelRefuelFallbackConfigForTests()` — recovery scheduler **OFF**, canonical numeric defaults.
- Updated RFRF runtime/di/fetch-outcome/F4-PR2 fixtures to use the helper.

### Tests added in B1

- `raw-refuel-candidate-recovery-restart-durability.postgres.integration.spec.ts` — process/service reconstruction without in-memory carryover.
- Extended `raw-refuel-candidate-recovery-f10-6-8-b.postgres.integration.spec.ts` — no-data backoff, promotion firewall, terminal direct-call safety, WOB window containment, native E2E with real converged event id.

### Validation

```bash
cd backend && npx tsc --noEmit -p tsconfig.json
cd backend && bash scripts/test/rfrf-f10-stage3-authority-matrix-tests.sh
cd backend && bash scripts/test/rfrf-f10-stage4-authority-matrix-tests.sh
cd backend && npm test -- --testPathPattern='raw-refuel-candidate-recovery|raw-fuel-rise-liveness|physical-refuel-f10-6-8|raw-fuel-refuel-fallback.config'
RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION=1 npm test -- --testPathPattern='raw-refuel-candidate-recovery-f10-6-8-b.postgres.integration.spec.ts|raw-refuel-candidate-recovery-restart-durability.postgres.integration.spec.ts'
```

Production: **not** deployed or mutated. Stage 5 **not** authorized.
