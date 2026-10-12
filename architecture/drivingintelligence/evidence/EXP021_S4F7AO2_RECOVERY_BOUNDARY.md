# EXP-021 S4F-7AO.2 — Replica recovery boundary fix

**Date (UTC):** 2026-10-09  
**PR:** #1943  

## Problem

Forward-path replica flags were set only after successful attestation, so rollback could skip replicas that had already been restarted when health/attestation failed.

## Fix

- `REPLICA_*_RUNTIME_DIRTY` set **before** `vps_replica_restart_one`
- `REPLICA_A_FIVE_FLAG_PROVEN` after successful A five-flag attestation
- `s4f7ao_compute_rollback_replica_scope`: A-only on A dirty without B proven; A+B when A proven or B dirty
- Rollback post-verify: authenticated `RECOVERY_PRESTATE` on **both** replicas (`FULL_A_B_PRESTATE_PROOF=YES`)
- `ROLLBACK_COMPLETED=YES` only when env + A/B runtime proof succeed

## Tests

`test:di:s4f7ao:five-flag-operator` — **36** cases including 7AO.2 recovery boundary scenarios.
