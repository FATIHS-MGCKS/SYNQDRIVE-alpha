# EXP-021 S4F-7Y — Fresh Tiny Live-Staging Transaction Execution Closure

**Date:** 2026-10-07  
**Slice:** Engineering-only (no Production mutation/restart/deploy in this PR)  
**Authority:** Driving Intelligence / S4 dormant Tiny staging  

## Intent

Close the intentional fail-closed gap after S4F-7W/S4F-7X dry-run wiring by implementing the **full fresh-authority live staging transaction** in ops tooling: operator-bound authorization packet, final pre-mutation revalidation, NO_BACKFILL trip gate, durable backup + recovery, exact three-key env mutation, rolling restart **A then B** with fresh `OTHER` attestation barrier, post-staging verification, and preimage rollback.

## Separation of authorities

| Authority | Env / gate | Role |
|-----------|------------|------|
| Tool ACK | `DI_S4_TINY_STAGING_ACK=YES` | Required for wrapper entry; **does not** authorize live mutation alone |
| Live staging | `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES` | Dedicated live mutation gate; `DI_S4F7V_LIVE_STAGING_AUTHORIZED=YES` **alone** is rejected |
| Activation Gate 6 | `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | Remains **NOT_SATISFIED** after successful staging |

## Operator authorization packet (independent binding)

Required `AUTHORIZED_*` pins compared against independently observed execution values (never copied from authorized → observed):

- `AUTHORIZED_TOOL_SHA`
- `AUTHORIZED_PRODUCTION_SHA`
- `AUTHORIZED_PRODUCTION_RELEASE_ID`
- `AUTHORIZED_PRE_ENV_SHA256`
- `AUTHORIZED_FRESH_NOT_BEFORE`
- `AUTHORIZED_FRESH_EXPECTED_FINGERPRINT`
- `AUTHORIZED_ORGANIZATION_ALLOWLIST` (`faa710c9-6d91-4079-a7d5-91fdccdec14a`)
- `AUTHORIZED_VEHICLE_ALLOWLIST` (`c10351f8-b6a2-4258-947f-631aeaa6d359`)

## Implementation surface

- `backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh` — live branch delegates to `s4f7y_execute_live_transaction`
- `backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh` — backup/recovery, A→B restart barrier, post-verify, rollback
- `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib.ts` — packet + NO_BACKFILL gate
- CLI: `validate-live-authorization`, `validate-no-backfill-final`, `apply-mutation-live`

## Engineering validation

```bash
cd backend && npm run test:di:s4f7v:fresh-tiny-staging-wrapper -- --runInBand
cd backend && npm run test:di:s4f7j:tiny-staging-wrapper -- --runInBand
cd backend && npm run build
```

Test harness exercises live transaction, rollback, A-failure blocks B, authorization failures, and dry-run regression — **without** Production execution in this slice.

## Engineering verdict (this PR)

- `LIVE_STAGING_SHELL_EXECUTION_READY=YES`
- `LIVE_STAGING_REMAINS_FAIL_CLOSED_WITHOUT_EXACT_OPERATOR_AUTHORIZATION=YES`
- `PRODUCTION_STAGING_AUTHORIZED=NO`
- `PRODUCTION_STAGING_EXECUTED=NO`
- `EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED`
- `TINY_ACTIVATION_READY=NO`

## S4F-7Y.1 safety seal (2026-10-07)

Corrective closure on PR **#1915** before merge. **Git authority:** starting PR head `bbf5b392da19cd96ed67fa756ad7899033a7c603` (the previously reported truncated/fabricated `bbf5b392d6c8f8e8…` SHA was **not** valid Git authority).

### Defects reproduced on starting PR head

| Defect | Evidence on starting head |
|--------|---------------------------|
| Successful live wrapper reported `PRODUCTION_STAGING_*=NO` | Wrapper forced NO after successful transaction |
| Legacy-only path emitted `OLD_S4F7V…=YES` | Misleading “can authorize” wording on rejection branch |
| Internal auth synthesis | `export DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES` inside final pre-mutation revalidation |
| Rollback restart swallowing | `vps_replica_restart_one … \|\| true` without FAILED surfacing |
| Incomplete rollback runtime proof | Missing explicit health/readiness/SHA/budget/redis rollback markers |
| No final env poststate reverify | Missing independent backup vs disk compare before commit |
| Weak test isolation | `DI_S4F7V_TEST_MODE` / `DI_S4F7V_FIXTURE_MODE` alone could enable live stubs |

### S4F-7Y.1 fixes

- External-only `DI_S4F7Y_LIVE_STAGING_AUTHORIZED` (revalidated, never synthesized)
- Dedicated `DI_S4F7Y_ENGINEERING_TEST_HARNESS=YES` contract (non-Production `backend.env`, fixture topology)
- Centralized terminal outcome emitter (no contradictory duplicate terminal keys)
- Full rollback restart accounting + expanded rollback convergence proofs
- `verify-live-poststate` CLI + final A/B fresh attestation reverify before disarm
- Correct production-success vs engineering-harness outcome semantics

Merge gate: **S4F-7Y.1 required** before treating S4F-7Y as merge-ready.

## S4F-7Y.2 terminal outcome forensics seal (2026-10-07)

- `S4F7Y_1_TECHNICAL_TRANSACTION_SAFETY=PASS` (preserved)
- `S4F7Y_2_TERMINAL_FORENSIC_SEMANTICS=PASS`

Monotonic internal production historical facts (`S4F7Y_OPERATOR_AUTH_VALIDATED`, staging attempt, env mutation, restart attempt/success counts, rollback attempt/completion, final state restored, transaction committed) drive a **single** terminal outcome authority (`TERMINAL_OUTCOME_AUTHORITY_COUNT=1`). Rollback restores runtime state but does not erase mutation/restart history. Pre-mutation emits `LIVE_STAGING_OPERATOR_AUTHORIZATION_VALIDATED=YES` only — not terminal `PRODUCTION_STAGING_AUTHORIZED`. Engineering harness and `DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION=YES` (fixture-backed) remain isolated from Production historical facts.

## Next operator action

After merge + CI: seal exact S4F-7Y.2 tool SHA and generate a **new** JIT staging authorization packet for human review before any real `DRY_RUN=0` Production run.
