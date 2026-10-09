# P1B1-A1 — Trusted governance evidence foundation (offline)

**Status:** IMPLEMENTED (verification-only slice). **Does not** authorize production execution.

## Scope

| Evidence kind | Contract | Authority source |
|---------------|----------|------------------|
| Governance ratification | `M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_V1` + repository merge evidence | Ed25519 + `M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_V1` (`GOVERNANCE_RATIFICATION`) + owner policy logins |
| Operator risk acceptance | `M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_V1` | Ed25519 + trust store (`OPERATOR_RISK_ACCEPTANCE`) + bound ticket/SHA/target |
| Deployment identity | `M3_3_HV_H4_A3_DEPLOYMENT_IDENTITY_EVIDENCE_V1` | Ed25519 + trust store (`DEPLOYMENT_PROBE`); freshness + probe nonce replay guard |
| PostgreSQL target | `M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_V1` | Ed25519 + trust store (`POSTGRES_TARGET`); **TARGET_CONFIGURATION_MATCHED only** in A1 |

## Non-goals (A1)

- No production SSH, deploy probe collection, or PostgreSQL connections.
- No real owner private keys in CI or repository.
- `resolvePhaseAProductionP1AuthorizationV1()` remains **`NO_GO`**.
- Governance signatures are **not** execution authorization.
- `LIVE_DATABASE_ROLE_VERIFIED` claims are rejected in A1 parsers.

## Runtime integration

`resolvePhaseAGovernanceExternalAuthorityVerifierV1(env)` loads an offline verifier when trust store, owner policy, and signed attestations are present; otherwise remains disabled (fail-closed). Human verification readiness may pass when evidence verifies; P1 execution gate unchanged.

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

Adversarial coverage: `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1b1-a1-governance-evidence.spec.ts`.
