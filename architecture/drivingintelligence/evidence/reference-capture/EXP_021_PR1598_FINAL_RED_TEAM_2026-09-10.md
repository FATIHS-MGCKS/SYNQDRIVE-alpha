# EXP-021 PR #1598 — Final pre-merge red-team (2026-09-10)

**PR:** #1598 `cursor/exp-021-t0-phase-settlement-hardening-7d78`  
**Status:** DRAFT — red-team pass applied; **not merged / not deployed**

---

## Findings addressed

### 1 — Single T0 authority (CRITICAL)

| Risk (pre-pass) | Fix |
|-----------------|-----|
| ATTACH with persisted T0 but no physical phase returned to `WAIT_MOVEMENT` and could re-detect T0 | `pendingT0PhaseActivation` + `RECOVER_T0_PHASE_ACTIVATION` path |
| `activatePhysicalPhaseAtT0` accepted caller `canonicalT0Ms` independent of DB authority | Removed caller T0; repository derives `canonicalT0Ms` from persisted `exp021PhysicalAuthority` inside locked transaction |
| Second movement could fork T0 | `persistExp021CanonicalT0Atomic` rejects candidate mismatch via `Exp021T0ConsistencyError` |
| `physicalDriveStartedAt` could diverge from persisted authority | Always set from `t0Persist.authority.canonicalT0At` after persist |

**Invariant:** `ONCE_CANONICAL_T0_PERSISTED_IT_IS_IMMUTABLE = YES`

### 2 — Orchestrator survivability

| Class | Behavior |
|-------|----------|
| `transient_provider` | Log + sleep + continue loop; lock retained |
| `recoverable_orchestration` | Mark `DEGRADED`, continue loop; PDI/end detection remain active in `DRIVING` |
| `integrity_fatal` | Fail closed; session terminalization in `finally` |
| **unknown** | **Defaults to `integrity_fatal`** (conservative) |

Outer catch no longer swallows non-integrity errors while exiting supervisor loop.

### 3 — Physical reanchor validation

`reanchorPhysicalCalibrationPhaseAtT0` now validates:

- series vehicle/token match
- idempotent `PHYSICAL_T0` / `PHYSICAL_TRANSITION` at same canonical T0
- **reject** `PHYSICAL_T0` with different T0 (`Exp021PhaseIdentityConflictError`)
- only seal `PRE_ROLL` (or missing provenance treated as PRE_ROLL)
- `phaseStartedAt <= canonicalT0`
- no duplicate completed-phase insertion

### 4 — Integration proof

Added `reference-capture-exp-021-t0-recovery.postgres.integration.spec.ts`:

- persist T0 → activate from persisted authority
- crash-after-T0 simulation (persist without activate, then activate)
- conflicting candidate T0 fails closed
- PHYSICAL_TRANSITION restart idempotent at same T0

Gated: `REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1` + isolated Postgres.

---

## Test matrix (local)

| Suite | Result |
|-------|--------|
| `reference-capture-exp-021-t0-hardening` | PASS (expanded) |
| `reference-capture-hf-calibration-phase.policy` | PASS |
| `reference-capture-exp-021-motion.lib` | PASS |
| operator-journey + abort-lifecycle | PASS |
| trip-fsm evidence subset | PASS |
| postgres T0 recovery integration | LOCAL_SKIP without isolated Postgres |
| backend build | PASS |
| DI graph/docs + module registry + i18n | PASS |

---

## Runtime / CI closure

**Superseded by:** `EXP_021_PR1598_FINAL_CLOSURE_2026-09-10.md` @ `33e680e5bf429272c7577ae082bfe6c4de1c5091`

All gates closed 2026-09-10: Trip FSM Production Readiness (run 34504226157), EXP-021 postgres T0 recovery (4/4 executed), full PR CI green.
