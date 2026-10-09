# Phase-A production governance mode contract (V2)

**Contract ID:** `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_V2`  
**Status:** `PROPOSED` — adapter over existing `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1` (unchanged semantics for default mode).

## Modes

| Mode | Env value | Human verification readiness |
|------|-----------|------------------------------|
| **Multi-party (default)** | `MULTI_PARTY_V1` or unset | Requires distinct `independentAuthorizationVerification` per GO/NO-GO V1 (legacy behavior). |
| **Single-operator** | `SINGLE_OPERATOR_V1` | Requires **GO/NO-GO V2** (`M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V2`) without `independentAuthorizationVerification`, **trusted** `M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_V1` (not self-declared `ratificationStatus`), and **change-specific** `M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_V2` with trusted provenance authentication. |

## SINGLE_OPERATOR_V1 requirements

1. **Governance adoption record** (`M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_V1`) with owner-declared intent only (`ratificationStatus: PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE` in-repo until owner merge).
2. **Ratification provenance claims** (`M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_V1`) — claim JSON only (`provenanceAuthenticationStatus: UNVERIFIED`). Self-authored `TRUSTED_EXTERNAL_VERIFIED` is **rejected**. Authority requires `M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_V1` from an external verifier (not configured in P1B1-A0).
3. **Per-change `operatorRiskAcceptance` V2** claim records (same trust boundary — no self-asserted trusted status).
4. **AI advisory** (`aiTechnicalReviewAdvisory`) optional; never satisfies human verification or execution `GO`.
5. **R4.2A admission** controls unchanged.
6. **Future Authority C** — offline Ed25519 trusted authorization (P1B0) plus independent deployment/target evidence (future P1B1); **P1B1-A0 keeps execution `NO_GO`.**

## MULTI_PARTY_V1 preservation

- `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1` field requirements unchanged.
- `INDEPENDENT_HUMAN_VERIFICATION` check unchanged when mode is default.
- Fail-closed if mode env is unknown or malformed.

## Execution boundary (P1B1-A0)

Governance mode affects **readiness human-verification substitution only**.  
`resolvePhaseAProductionP1AuthorizationV1()` remains **`NO_GO`** until a future slice integrates Authority C with independently verified deployment identity.
