# DSRG — Change ledger (canonical append-only)

**Canonical location** (Standard §4 migration, DSRG-03 R2): this file.  
**Compatibility:** [`../CHANGE_LEDGER.md`](../CHANGE_LEDGER.md) redirects here — do not append to root file.

| Date (UTC) | ID | Change | Production impact |
|------------|-----|--------|-------------------|
| 2026-10-10 | **DSRG-01** | Document DSRG authority; map VO5C P4B12–P4B16; record P6 pin promotion seal | None (docs) |
| 2026-10-10 | **DSRG-01-A** | Fix pinned runner `exec` → `exec bash` for git-clean `vps-deploy-release.sh` (100644); execution-contract selftest | Merged PR #1970 |
| 2026-10-10 | **DSRG-01-R1** | Runner must be invoked from pinned ops dir (not `/current`); preflight from pin | Merged PR #1970 |
| 2026-10-11 | **DSRG-02-R0** | Read-only preflight for pin `40c6dd9` → `448a889` | None |
| 2026-10-11 | **DSRG-02-R1** | VPS pin promotion; config pointer only; `40c6dd9` tree preserved | Live app unchanged |
| 2026-10-11 | **DSRG-02-R2** | Final seal + evidence `DSRG_02_PIN_REPROMOTION_2026-10-11.md` | None (audit/docs) |
| 2026-10-11 | **DSRG-03-R0** | Central registry row + authority bootstrap; **no** `AUTHORITY_ACTIVE` | None (docs/audit) |
| 2026-10-11 | **DSRG-03-R1** | Manifest metadata final gate for PR #1973 | None (docs) |
| 2026-10-11 | **DSRG-03-R2** | Knowledge graph, validators, Production R2 reconciliation, ledger migration | None (docs/audit) |
| 2026-10-11 | **DSRG-03-R3** | Final authority audit; R3 Production + SQL; Gate A split; execution inventory; graph via registry CI chain | None (docs/audit) |
| 2026-10-11 | **DSRG-03-R4** | Graph validator isolated deps (`architecture/dsrg/scripts`); no backend `npm ci`; negative fixture self-test; break-glass prerequisites BG-A–F; `BREAK_GLASS_READY=NOT_VERIFIED` | None (docs/validators) |
| 2026-10-11 | **DSRG-03-R5** | Correct break-glass VPS paths to `/opt/synqdrive/shared/`; recovery mechanisms classified NOT_VERIFIED where unproven | None (docs) |
| 2026-10-11 | **DSRG-03-R6** | Propose registry `AUTHORITY_ACTIVE`; Gate A revalidated; runtime enforcement explicitly not promoted | None (docs/registry) |
| 2026-10-11 | **P4B16-R0** | Read-only VPS attestation audit; code inventory; lifecycle design; offline test matrix; no ops script changes | None (docs/audit) |
| 2026-10-11 | **P4B16-R0A** | Design correction: journal publication, PM2 consumer matrix, per-replica runtime identity, entrypoint coverage | None (docs) |
| 2026-10-11 | **P4B16-R1A** | Durable attestation libs + offline selftest; **not** wired to deploy/Production | None (repo-only; NOT_DEPLOYED) |
| 2026-10-11 | **P4B16-R1A-MIN** | Minimalism pass: drop journal/phase machine; delegate replica verify to existing ops lib | None (repo-only) |
| 2026-10-11 | **P4B16-R1B** | Wire attestation into `vps-deploy-release.sh` + `vps_replica_rollback`; partial-success exit 3; offline integration selftest | None (repo-only; NOT_DEPLOYED) |

Historical VO5C deploy-governance entries remain in [`../../vehicle-onboarding/research/CHANGE_LEDGER.md`](../../vehicle-onboarding/research/CHANGE_LEDGER.md) — reference only.
