# P1B1-A1 — Trusted governance evidence foundation (offline)

**Status:** IMPLEMENTED (verification-only slice). **Does not** authorize production execution.

## Scope

| Evidence kind | Contract | Authority source |
|---------------|----------|------------------|
| Governance ratification | `M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_V1` + repository merge evidence | Ed25519 + `M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_V1` (`GOVERNANCE_RATIFICATION`) + owner policy logins |
| Operator risk acceptance | `M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_V2` (signed `acceptedAtUtc`) | Ed25519 + trust store (`OPERATOR_RISK_ACCEPTANCE`) + bound ticket/SHA/target + claims timestamp match |
| Deployment identity | `M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_V1` | Ed25519 + trust store (`DEPLOYMENT_PROBE`); freshness + probe nonce replay guard |
| PostgreSQL target | `M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_V1` | Ed25519 + trust store (`POSTGRES_TARGET`); **TARGET_CONFIGURATION_MATCHED only** in A1 |

## Non-goals (A1)

- No production SSH, deploy probe collection, or PostgreSQL connections.
- No real owner private keys in CI or repository.
- `resolvePhaseAProductionP1AuthorizationV1()` remains **`NO_GO`**.
- Governance signatures are **not** execution authorization.
- `LIVE_DATABASE_ROLE_VERIFIED` claims are rejected in A1 parsers.

## Runtime integration (P1B1-A1-H1 through H3)

`resolvePhaseAGovernanceExternalAuthorityVerifierV1(env)` is **unconditionally disabled** (fail-closed through A1/H1/H2/H3) — caller-supplied trust-store / owner-policy JSON from the same channel as claims cannot establish production authority (`PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED`).

Offline cryptographic verifiers may return `SIGNATURE_VALID_WITH_SUPPLIED_KEY` for diagnostics/tests; that is **separate** from `INDEPENDENT_AUTHORITY_VERIFIED`. Fixture GitHub merge evidence never promotes to production ratification (`REPOSITORY_MERGE_PROVENANCE_UNVERIFIED`). Human verification readiness does not pass from synthetic env bundles; **`resolvePhaseAProductionP1AuthorizationV1()` remains `NO_GO`** (`P1_AUTHORIZATION=NO_GO`).

## Parser integrity (P1B1-A1-H2 / H3)

- Shared `parseGovernanceSignedAttestationV1`: Ed25519 only; `keyId` must be non-empty and **exact** (no leading/trailing whitespace normalization); detached Base64 must be **88-character canonical padded** encoding of exactly 64 signature bytes with `Buffer.from(s, 'base64').toString('base64') === s` (rejects unpadded equivalents and padding-bit aliases); required field types; fail-closed before crypto.
- All offline evidence parsers and `verifyGovernanceEd25519SignatureV1` use the shared parser; exported offline paths wrap parsing so malformed JSON cannot throw.
- Operator risk attestation **V2** includes `acceptedAtUtc` in the signed payload; claims binding rejects `PHASE_A_OPERATOR_RISK_ACCEPTANCE_TIMESTAMP_SIGNATURE_MISMATCH` when only the claim timestamp is tampered.

## Env material (optional, offline)

- `M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON` / `_PATH`
- `M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON` / `_PATH`
- `M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_JSON` / `_PATH`
- `M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_JSON` / `_PATH`
- `M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_JSON` / `_PATH`

## Validation

```bash
cd backend && npm run test:battery:v2:hv-h4
```

Adversarial coverage: `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1b1-a1-governance-evidence.spec.ts`, `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1b1-a1-h1-governance-trust-anchor.spec.ts`, `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1b1-a1-h2-evidence-parser-integrity.spec.ts`, `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1b1-a1-h3-canonical-signature-encoding.spec.ts`.
