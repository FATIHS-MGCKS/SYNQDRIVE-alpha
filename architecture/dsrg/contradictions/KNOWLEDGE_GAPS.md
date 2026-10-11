# DSRG — Knowledge gaps

Stable IDs align with graph nodes (`DSRG-GAP-*`). Epistemic state per row.

| ID | Gap | Impact | Next verification |
|----|-----|--------|-------------------|
| DSRG-GAP-01 | Gate-6 live kill registry not re-probed in DSRG-03 R2 | EXP021 safety claims rely on DSRG-02 **HISTORICAL** seal | Bounded read of Gate-6 guard state (read-only) |
| DSRG-GAP-02 | APDS ACTIVE epoch row not re-queried on VPS | Shadow epoch stability | SQL or APDS admin read-only API |
| DSRG-GAP-03 | VO5C admission/MFA flags absent from `backend.env` grep | Product admission vs deploy governance boundary | Vehicle Onboarding Production audit |
| DSRG-GAP-04 | `main` tip vs live app `7f47c9f` | Release attestation completeness | **INFERRED:** `7f47c9f` is ancestor of `main` @ `46478500` |
| DSRG-GAP-05 | OS sudoers / wrapper not installed | Enforcement phase blocked | Inspect `/etc/sudoers.d/` when authorized |
| DSRG-GAP-06 | Knowledge graph validators | Was promotion blocker pre-R2 | **Addressed** in DSRG-03 R2 — re-validate after substantive changes |
| DSRG-GAP-07 | RFRF rollback traps on VPS not independently exercised | Cross-module rollback confidence | RFRF read-only audit |
| DSRG-GAP-08 | Direct `current` deploy while enforcement OFF | Expected pre-enforcement; negative test missing | Authorized enforcement drill |

## Contradictions

See [`OPEN_CONTRADICTIONS.md`](OPEN_CONTRADICTIONS.md) — **DSRG-CONTRA-001** resolved.
