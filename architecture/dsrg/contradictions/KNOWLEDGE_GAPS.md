# DSRG — Knowledge gaps

Epistemic state per gap: **UNKNOWN** unless noted.

| ID | Gap | Impact | Next verification |
|----|-----|--------|-------------------|
| G-DSRG-01 | Gate-6 live kill registry not re-probed in DSRG-03 R0 | EXP021 safety claims rely on DSRG-02 seal | Bounded read of Gate-6 guard state files or DI ops probe (read-only) |
| G-DSRG-02 | APDS ACTIVE epoch row not re-queried on VPS in DSRG-03 R0 | Shadow epoch stability | SQL or APDS admin read-only API |
| G-DSRG-03 | VO5C admission/MFA flags absent from `backend.env` grep | Product admission vs deploy governance boundary | Vehicle Onboarding Production audit |
| G-DSRG-04 | `origin/main` tip vs live app `7f47c9f` ancestry mapping | Release attestation completeness | Map release tag to git SHA on main |
| G-DSRG-05 | OS sudoers / wrapper not installed | Enforcement Phase blocked | Inspect `/etc/sudoers.d/` when authorized |
| G-DSRG-06 | `KNOWLEDGE_GRAPH.md` and validators missing | Promotion to `AUTHORITY_ACTIVE` blocked | Build graph per Standard §4 |
| G-DSRG-07 | RFRF rollback traps on VPS not independently exercised in DSRG-03 | Cross-module rollback confidence | RFRF read-only audit or staged drill (authorized) |
| G-DSRG-08 | Direct `current` deploy path still reachable while enforcement OFF | Expected pre-enforcement; unvalidated negative test | Authorized enforcement drill |

## Contradictions

No **CONTRADICTED** claims registered in DSRG-03 R0. Repository pin contract (`448a889`) and Production pin config **align**.

See also [`OPEN_CONTRADICTIONS.md`](OPEN_CONTRADICTIONS.md) — **file not yet created** (Standard §4 pending).
