# VDC RB-019 P2.5 — Bootstrap GT-R1 Expected-Fix Proof Closure

| Field | Value |
|-------|-------|
| **Date** | 2026-09-17 |
| **Baseline** | `7779dd1d5` (post failed Production shadow pilot at `102b3f917`) |
| **Epistemic** | **IMPLEMENTATION_PRESENT** — code + tests; Production shadow still OFF |

## BEFORE

Initial STATEFUL_SHADOW bootstrap on empty physical projections produced `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` for all four pilot scopes: legacy `no_open_episode` reject + physical `ESTABLISHED` accept, with `gtR1Proof=null` because only `SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE` existed.

## CHANGE

- Added `SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT` GT-R1 proof scenario (absent projection → PLUGGED bootstrap).
- `buildSnapshotGtR1Proof()` resolver: repair precedence, then bootstrap.
- Wired from `PhysicalStateSnapshotEvidenceOrchestrator` real call-site.
- Classification reuses `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` (non-blocking) when bootstrap proof is valid.
- **Bootstrap expected-fix is bound to actual coordinator transition:** `isProvenExpectedFixForPhysicalDecision()` requires `ESTABLISHED` for `SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT`; repair/webhook proofs unchanged. Fail-closed against stale pre-read / multi-replica races (PSG-TIME-0A, BOOTSTRAP-ACTUAL-1..4, PG regression).
- **7-day epoch isolation:** new pilot epoch starts at `NEW_PILOT_RESTART_T0`. Both `summarizeScopeWindow({ windowStart })` and `getOperationalCoverage({ windowStart, windowEnd? })` use comparison/runtime `observedAt >= windowStart` only. Historical failed-pilot rows remain preserved in DB but cannot backdate or satisfy the restarted 7-day window (PSG-TIME-0A/0B/0C).

## Classification decision

No new taxonomy bucket. Bootstrap establishment is semantically an expected legacy→physical improvement and maps to existing `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT`.

## Bootstrap expected-fix invariant

```
BOOTSTRAP_EXPECTED_FIX
  = valid SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT proof
  AND actual coordinator transition == ESTABLISHED
```

Stale pre-read projection (`physicalProjectionState == null` before reconcile) cannot bless `APPLIED`, `DUPLICATE`, `STALE`, `CONFLICT`, `INSUFFICIENT_EVIDENCE`, or `null`.

## New epoch evidence query (runbook)

```typescript
const NEW_PILOT_RESTART_T0 = new Date('2026-09-17T00:00:00.000Z'); // captured at shadow re-enable

observationRepository.summarizeScopeWindow({
  organizationId,
  vehicleId,
  provider: 'DIMO',
  windowStart: NEW_PILOT_RESTART_T0,
  windowEnd: now,
});

observationRepository.getOperationalCoverage({
  organizationId,
  vehicleId,
  provider: 'DIMO',
  windowStart: NEW_PILOT_RESTART_T0,
  windowEnd: now, // optional
});
```

Both APIs use comparison/runtime `observedAt` only. `evidenceObservedAt` never contributes to elapsed-time proof. Invalid or inverted windows fail closed (zero count, `sevenDayOperationalWindowProven = false`).

## Non-effects

- Does not mutate five historical Production shadow observations.
- Does not re-enable STATEFUL_SHADOW.
- Does not execute preseed APPLY or authority cutover.
- Does not claim Production validation.
