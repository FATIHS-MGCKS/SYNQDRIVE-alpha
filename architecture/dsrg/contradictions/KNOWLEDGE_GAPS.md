# DSRG — Knowledge gaps (R3 classification)

Graph nodes: `DSRG-GAP-*` in [`graph/nodes.yaml`](../graph/nodes.yaml).

| ID | Classification | Summary | Evidence |
|----|----------------|---------|----------|
| DSRG-GAP-01 | **CLOSED_WITH_EVIDENCE** | Gate-6 GLOBAL kill state | `di_v0_s4_control`: `KILLED` @ `2026-10-02T05:46:16Z` — [`DSRG_03_R3_PRODUCTION_AUDIT.md`](../evidence/DSRG_03_R3_PRODUCTION_AUDIT.md) |
| DSRG-GAP-02 | **CLOSED_WITH_EVIDENCE** | APDS ACTIVE epoch | Epoch `3cbc5d95-a5fb-4259-8c00-88f0df93e77a` @ `2026-10-09T21:40:53.798Z`; pin `ab72f574…` — R3 SQL + `backend.env` |
| DSRG-GAP-03 | **OPEN_NONBLOCKING** (authority) | VO5C admission/MFA not in `backend.env` | Vehicle Onboarding Production audit — not DSRG deploy-governance blocker |
| DSRG-GAP-04 | **CLOSED_WITH_EVIDENCE** | `main` vs deployed app | `7f47c9f` ancestor of `main` @ `299205bc` |
| DSRG-GAP-05 | **OPEN_BLOCKING_ENFORCEMENT** | OS sudoers / wrapper not installed | R3: `synqdrive-vo5c-deploy` sudoers **absent** |
| DSRG-GAP-06 | **CLOSED_WITH_EVIDENCE** | Graph validators | DSRG-03 R2 + CI hook R3 |
| DSRG-GAP-07 | **OPEN_NONBLOCKING** | RFRF traps not exercised on VPS | RFRF scripts present on live release; no drill run |
| DSRG-GAP-08 | **OPEN_BLOCKING_ENFORCEMENT** | Negative bypass test while enforcement OFF | Requires authorized enforcement drill |

**OPEN_BLOCKING_AUTHORITY:** **none** after R3 (architecture Gate A pass).

See [`OPEN_CONTRADICTIONS.md`](OPEN_CONTRADICTIONS.md).
