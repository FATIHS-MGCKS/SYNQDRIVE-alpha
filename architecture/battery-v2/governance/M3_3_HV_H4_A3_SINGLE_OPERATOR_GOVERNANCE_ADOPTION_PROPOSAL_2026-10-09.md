# Governance adoption proposal — Single-operator Path B (P1B1-A0)

**Proposal ID:** `M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_PROPOSAL_2026-10-09`  
**Ratification status:** `PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE`  
**Does not authorize production execution, a change ticket, or P1 `GO`.**

## Owner-declared policy choice (documented intent)

The SynqDrive owner has **explicitly confirmed** adoption of `M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1` using **governance Path B** (single-operator security-review exception per contract §7.1).

This confirmation approves the **governance model only**. It is **not**:

- cryptographically signed machine authorization (Authority C),
- per-change `operatorRiskAcceptance`,
- production database access,
- deployment identity proof,
- or `p1Authorization=GO`.

## Recorded authorities

| Authority | Role |
|-----------|------|
| **A — Human owner/operator** | Accountability, change ticket ownership, maintenance window, stop conditions, future per-change `operatorRiskAcceptance`. |
| **B — AI-assisted technical review** | **Advisory only** (`nonAuthorizing: true`); never a second human verifier. |
| **C — Machine authorization** | Future Ed25519 trusted authorization + R4.2A admission; remains **dormant** until a later P1B1 slice with independent deployment evidence. |

## Path B acknowledgements

- **No second human security reviewer** is required for readiness **when** this adoption is ratified and change-specific `operatorRiskAcceptance` is present — not before.
- **Residual risk** of single-operator governance is explicitly acknowledged at policy level; per-change acceptance remains mandatory for execution.
- **Multi-party / two-human** governance remains the default for `MULTI_PARTY_V1` mode and is not silently removed.
- **External mandatory separation-of-duties** (legal, regulatory, organizational) **cannot** be overridden by this proposal or by repository automation.

## Ratification (owner-controlled)

Ratification occurs only when the owner **merges** this proposal (and any linked machine-readable adoption record) through normal repository governance.

Until ratification:

- `ratificationStatus` remains `PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE`.
- Runtime must **fail closed** for single-operator readiness shortcuts.
- Agents must **not** invent signatures, verified operator identity, approval timestamps, or per-change risk acceptance.

## Machine-readable companion

Template (non-executing until ratified):  
`architecture/battery-v2/schemas/M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_V1.template.json`

Normative mode contract:  
`architecture/battery-v2/governance/M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2.md`
