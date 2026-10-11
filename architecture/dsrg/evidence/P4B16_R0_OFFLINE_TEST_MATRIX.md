# P4B16 — Offline test matrix (implementation backlog, R0A)

Fixtures: isolated temp `SYNQDRIVE_DEPLOY_STATE_DIR`, mock `pm2`/`curl`/`git` (pattern: `vps-multi-replica-deploy.selftest.sh`).

| # | Scenario | Expected outcome | Key assertions |
|---|----------|------------------|----------------|
| 1 | Normal two-replica deploy | Journal ends `PUBLISHED`; phase COMMITTED | Runtime identity match both replicas |
| 2 | Mixed-SHA rollout window | IN_PROGRESS; not COMMITTED | Readers fail-closed |
| 3 | Replica B fails after A | FAILED / rollback | No `PUBLISHED` journal |
| 4 | Post-deploy verify fails | FAILED | State generation unchanged |
| 5 | Rollback succeeds | `ROLLBACK_PUBLISHED`; ROLLED_BACK | Same lock as deploy |
| 6 | Rollback denied (floor) | CONTAINED | No forward `PUBLISHED` |
| 7 | Rollback partial failure | CONTAINED | No PM2 resurrect bypass |
| 8 | Idempotent resume | Single `PUBLISHED` for gen=N | Safe replay from journal |
| 9 | Crash before `STATE_DURABLE` | Recovery | No COMMITTED visible |
| 10 | Crash after state, before mirror | Recovery | Journal without `PUBLISHED`; fail-closed readers |
| 11 | Crash after mirror, before `PUBLISHED` | Idempotent complete | No duplicate deploy |
| 12 | Crash during `backend.env` backup | Live env unchanged | Only `.bak-*` partial |
| 13 | State checksum mismatch | FAIL-CLOSED | Alert |
| 14 | `backend.env` mirror ≠ state | CRITICAL alert | State authoritative |
| 15 | Concurrent deploy | Second aborts | `flock` on `.attestation.lock` |
| 16 | Concurrent rollback + deploy | One wins | Lock ordering defined |
| 17 | Runtime identity mismatch | No COMMITTED | Per-replica API |
| 18 | Missing manifest in release | FAIL at verify | No git-only fallback as COMMITTED |
| 19 | APDS approved pin | Unchanged | No write to APDS env |
| 20 | Enforcement OFF legacy path | Commit only if script version has lib | Bypass documented |
| 21 | Connectivity staging script | No attestation publish | Excluded path |
| 22 | Journal tail corrupt | FAIL-CLOSED | Human recover flag |

**R0/R0A:** design only — no new selftest scripts until implementation phase.
