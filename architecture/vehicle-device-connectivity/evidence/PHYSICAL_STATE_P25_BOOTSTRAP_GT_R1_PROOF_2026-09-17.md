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
- PSG-TIME-0: `summarizeScopeWindow({ windowStart: NEW_PILOT_RESTART_T0 })` excludes pre-restart correctness blockers without row deletion.

## Classification decision

No new taxonomy bucket. Bootstrap establishment is semantically an expected legacy→physical improvement and maps to existing `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT`.

## New epoch evidence query (runbook)

```typescript
observationRepository.summarizeScopeWindow({
  organizationId,
  vehicleId,
  provider: 'DIMO',
  windowStart: NEW_PILOT_RESTART_T0, // ISO timestamp captured at shadow re-enable
  windowEnd: now,
});
```

`getOperationalCoverage()` span proof must also use only comparisons with `observedAt >= NEW_PILOT_RESTART_T0` when restarting after a failed pilot.

## Non-effects

- Does not mutate five historical Production shadow observations.
- Does not re-enable STATEFUL_SHADOW.
- Does not execute preseed APPLY or authority cutover.
