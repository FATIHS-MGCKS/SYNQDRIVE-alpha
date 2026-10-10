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
2. **Ratification provenance claims** (`M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_V1`) — claim JSON only (`provenanceAuthenticationStatus: UNVERIFIED`). Self-authored `TRUSTED_EXTERNAL_VERIFIED` is **rejected**. Authority requires `M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_V1` from an **independently provisioned** external verifier (not satisfied by in-repo/offline material alone).
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

## P1B1-A1 governance evidence integration (A1 / H1 / H2 / H3)

As implemented on PR #1956 through **P1B1-A1-H3**:

| Surface | Behavior |
|---------|----------|
| **`resolvePhaseAGovernanceExternalAuthorityVerifierV1(env)`** | **Unconditionally disabled** (fail-closed). Returns `PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED` for every environment, including when trust-store or attestation JSON is present in env. Caller-supplied material cannot promote production governance authority. |
| **Offline Ed25519 evidence verifiers** | Available for **diagnostics and unit tests** only. May report `SIGNATURE_VALID_WITH_SUPPLIED_KEY` when a supplied public key verifies a digest. This is **not** `INDEPENDENT_AUTHORITY_VERIFIED` and does **not** satisfy SINGLE_OPERATOR_V1 human-verification readiness from synthetic bundles. |
| **Path B operational readiness** | Does **not** pass human verification solely because offline crypto checks succeed or env-loaded attestations parse. Readiness still requires a future independently anchored verifier and owner-controlled evidence acquisition outside the self-asserted claim channel. |
| **`resolvePhaseAProductionP1AuthorizationV1()`** | Remains **`NO_GO`** (`P1_AUTHORIZATION=NO_GO`). No production execution authorization from governance signatures or offline verification alone. |

H1 closed env-based trust promotion; H2 bound operator-risk `acceptedAtUtc` in signed attestation V2; H3 enforced canonical Ed25519 detached Base64 and exact `keyId` — **without** re-enabling the production governance authority resolver.
