# P4B16 R0 — Offline test matrix (implementation backlog)

Fixtures: isolated temp `SYNQDRIVE_DEPLOY_STATE_DIR`, mock `pm2`/`curl`/`git` (pattern: existing `vps-multi-replica-deploy.selftest.sh`).

| # | Scenario | Expected attestation phase | Key assertions |
|---|----------|---------------------------|----------------|
| 1 | Normal two-replica deploy success | PREPARED → IN_PROGRESS → VERIFIED → COMMITTED | `COMMITTED_SHA==REQUESTED`; `backend.env` updated once |
| 2 | Mixed-SHA window mid-rollout | IN_PROGRESS | Readers fail-closed; not COMMITTED |
| 3 | Replica B fails after A healthy | FAILED → ROLLBACK_IN_PROGRESS or CONTAINED | No COMMITTED to target |
| 4 | Post-deploy verify fails | FAILED | Attestation unchanged |
| 5 | Rollback succeeds | ROLLED_BACK | `COMMITTED_SHA==PREVIOUS_SHA` |
| 6 | Rollback denied (security floor) | CONTAINED | No forward SHA commit |
| 7 | Rollback fails mid-way | CONTAINED | PM2 resurrect disabled paths respected |
| 8 | Duplicate commit (re-run) | COMMITTED (idempotent) | Single checksum history |
| 9 | Interrupted write (crash before mv) | Recovery → IN_PROGRESS or CONTAINED | `.new` + backup present |
| 10 | Target vs current mismatch | FAIL-CLOSED | No COMMITTED |
| 11 | Stale IN_PROGRESS marker | FAIL-CLOSED or recover flag | Alert threshold |
| 12 | Concurrent deploy race | Second aborts | Lock held |
| 13 | Release dir missing git metadata | Use staged `TARGET_SHA` from clone step | Document fallback |
| 14 | APDS approved pin | Unchanged after commit | grep env before/after |
| 15 | Enforcement OFF | Legacy entrypoint unchanged | No authority file |
| 16 | Legacy direct `current` deploy | Attestation optional / WARN | Document bypass risk |

**R0:** design only — no new selftest scripts committed until implementation phase.
