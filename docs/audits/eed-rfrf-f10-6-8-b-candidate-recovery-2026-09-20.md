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

## Validation

```bash
cd backend && npm test -- --testPathPattern='raw-refuel-candidate-recovery|raw-fuel-rise-liveness|physical-refuel-f10-6-8|raw-fuel-refuel-fallback.config'
RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION=1 npm test -- --testPathPattern='raw-refuel-candidate-recovery-f10-6-8-b.postgres.integration.spec.ts'
```
