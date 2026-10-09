# Phase-A production governance mode contract (V2)

**Contract ID:** `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_V2`  
**Status:** `PROPOSED` — adapter over existing `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1` (unchanged semantics for default mode).

## Modes

| Mode | Env value | Human verification readiness |
|------|-----------|------------------------------|
| **Multi-party (default)** | `MULTI_PARTY_V1` or unset | Requires distinct `independentAuthorizationVerification` per GO/NO-GO V1 (legacy behavior). |
| **Single-operator** | `SINGLE_OPERATOR_V1` | Requires **ratified** governance adoption record + **change-specific** `operatorRiskAcceptance`; does **not** require a fictional second human verifier. |

## SINGLE_OPERATOR_V1 requirements

1. **Governance adoption record** (`M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_V1`) with `ratificationStatus: RATIFIED` (owner-controlled repository merge only).
2. **Per-change `operatorRiskAcceptance`** aligned to GO/NO-GO `changeTicket` (not granted by policy adoption alone).
3. **AI advisory** (`aiTechnicalReviewAdvisory`) optional; never satisfies human verification or execution `GO`.
4. **R4.2A admission** controls unchanged.
5. **Future Authority C** — offline Ed25519 trusted authorization (P1B0) plus independent deployment/target evidence (future P1B1); **P1B1-A0 keeps execution `NO_GO`.**

## MULTI_PARTY_V1 preservation

- `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1` field requirements unchanged.
- `INDEPENDENT_HUMAN_VERIFICATION` check unchanged when mode is default.
- Fail-closed if mode env is unknown or malformed.

## Execution boundary (P1B1-A0)

Governance mode affects **readiness human-verification substitution only**.  
`resolvePhaseAProductionP1AuthorizationV1()` remains **`NO_GO`** until a future slice integrates Authority C with independently verified deployment identity.
