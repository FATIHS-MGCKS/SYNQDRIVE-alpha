# ADR — M3.3-HV-H4-A3.3-O2-R4.2B-P1B0 Single-operator trusted Phase-A authorization

| Field | Value |
|-------|-------|
| **ID** | `BAT-V2-DEC-HV-H4-A3-P1B0-SINGLE-OPERATOR-AUTHZ-001` |
| **Status** | `PROPOSED` |
| **Date** | 2026-10-09 |
| **Scope** | Production Phase-A read-only preflight **execution authorization** only |
| **Non-scope** | Phase-B, issuer activation, schema DDL, retention/reconciliation/backfill activation |

## Context

SynqDrive production Phase-A execution is fail-closed (`resolvePhaseAProductionP1AuthorizationV1` → `NO_GO` on `main` after PR #1948). Offline R4.2B-P0 readiness and R4.2A admission contracts exist, but they cannot cryptographically prove that a **human** accepted operational risk or that a **second human** independently verified the change.

The repository owner may be the **sole** human operator. The legacy GO/NO-GO contract (`M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1`) requires `independentAuthorizationVerification.verifierIdentity` distinct from the approval author — a **two-human** policy. An AI assistant **cannot** satisfy that policy without fabricating a human verifier identity.

## Decision

Adopt a **three-authority** model for owner-operated production Phase-A:

| Authority | Role | Authorizes production connect? |
|-----------|------|--------------------------------|
| **A — Human owner/operator** | Accepts change ticket, maintenance window, target, and residual risk **outside** the runtime (change record, verbal discipline, break-glass policy). | **No** (intent only) |
| **B — AI-assisted technical review** | Produces **advisory** evidence (diff review, threat notes, CI pointers). Recorded as `AI_TECHNICAL_REVIEW_ADVISORY` — never `PASS` on human authentication checks. | **No** |
| **C — Machine execution gate** | Verifies an **Ed25519 detached signature** over a canonical authorization payload bound to release SHA, deployment identity, Postgres target fingerprint, manifest fingerprint, nonce, window, and prohibition flags. Consumes single-use approval store at execution time (existing R4.2A). | **Only** authority that may yield `p1Authorization=GO` when integrated (future slice **P1B1**; **not** in P1B0) |

### Governance policy versioning (no silent weakening)

| Artifact | Two-human expectation | Owner-operated replacement |
|----------|----------------------|----------------------------|
| `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1` § `independentAuthorizationVerification` | Distinct **human** verifier required for offline `READY` | **Unchanged** until org enables `M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1` (see governance contract). Under that contract, readiness uses `operatorRiskAcceptance` + optional `aiTechnicalReviewAdvisory` instead of inventing a second human verifier. |
| `evaluatePhaseAProductionOperationalReadinessV1` check `INDEPENDENT_HUMAN_VERIFICATION` | Fails if verifier matches approver | **Future P1B1:** branch on governance mode — do **not** treat AI identity as verifier. |
| `externalHumanAuthorizationAuthentication` | Always `UNVERIFIED` unless trusted external evidence | Remains `UNVERIFIED` for JSON-only; becomes `TRUSTED_EXTERNAL` only after **verified Ed25519 evidence** at execution gate (future). |
| AI / Cursor / Cloud Agent review | Must not be labeled independent human approval | Explicit advisory channel only |

**Requires human policy approval:** enabling `SINGLE_OPERATOR` mode is an **organizational** decision documented in the governance contract — not something code can auto-approve.

## Trusted authorization design (Ed25519)

- **Algorithm:** Ed25519 detached signature (Node.js `crypto.sign` / `crypto.verify`, `Ed25519` keys).
- **Payload:** `M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_V1` (JSON schema in `architecture/battery-v2/schemas/`).
- **Canonicalization:** stable UTF-8 JSON with recursively sorted object keys; payload bytes hashed with SHA-256; signature over hash (see verifier module).
- **Bindings:** release SHA, deployment identity tuple, `canonicalPostgresTargetKeyV1` fingerprint (no passwords), audit role login, Phase-A query manifest fingerprint, approvalId + executeNonce, maintenance window, explicit `authorizationLimits` false, evidence destination, consumption store path hash.
- **Keys:** private key **never** in git, CI secrets, production app env, or audit runner env. Public keys in operator-controlled trust store (file or env path on execution host only). Documented rotation via `keyId` + `notAfter` on trust entries.
- **Signing:** separate operator workstation script/process (documented in governance contract); not invoked from application runtime in P1B0.

## Threat model (summary)

| Threat | Mitigation in design | Residual |
|--------|---------------------|----------|
| Forged / modified artifact | Ed25519 verify over canonical payload; schema validation | Compromised private key |
| Replay / concurrent execution | Unique nonce + atomic consumption store (R4.2A) + optional execution lease (future) | Stolen artifact before consumption |
| Wrong DB target | `postgresTargetFingerprint` binding vs runtime URL key | Operator signs wrong fingerprint |
| Stale deployment SHA | `authorizedReleaseSha` + `deploymentIdentity` in signed payload vs runtime probe (future P1B1) | Operator signs old SHA knowingly |
| Expired approval | `maintenanceWindow` + `expiresAtUtc` vs clock | Clock skew / long windows |
| Key compromise / rotation | `keyId`, trust store `notAfter`, revocation list | Delayed revocation |
| Self-authored JSON as “external” | JSON alone never sets `GO`; only signature from trusted pubkey | Social engineering |
| Direct runner bypass | Execution gate remains mandatory on all production entrypoints | Host-level env tampering |

**Cannot prove:** separation of duties between two humans; that the signing key holder is a different person than the database owner; regulatory SOX-style independent review.

## Consequences

- P1B0 delivers **architecture + offline verifier + test plan** only. **No** wiring to `resolvePhaseAProductionP1AuthorizationV1`.
- Next implementation slice (**P1B1**): integrate verifier into execution gate, deployment SHA probe, governance mode switch with human-approved policy flag, operator signing CLI outside repo CI.

## References

- Governance contract: `governance/M3_3_HV_H4_A3_PHASE_A_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1.md`
- Evidence schema: `schemas/M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_V1.schema.json`
- Offline test plan: `validation/M3_3_HV_H4_A3_PHASE_A_P1_OFFLINE_AUTHORIZATION_VERIFICATION_TEST_PLAN_2026-10-09.md`
- Verifier (isolated): `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.verify-offline.v1.ts`
