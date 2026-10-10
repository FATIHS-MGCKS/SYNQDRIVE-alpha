# P1B1-A2 — Independent provenance & runtime evidence foundation

**Status:** IMPLEMENTED (foundation only). **Does not** authorize production execution (`P1_AUTHORIZATION=NO_GO`).

## Evidence pipeline (four states)

| State | Meaning | A2 |
|-------|---------|-----|
| 1 | Evidence received | Parse/acquire contracts |
| 2 | Structurally valid | Schema + policy binding |
| 3 | Cryptographic verification with supplied key | Reuses P1B1-A1 Ed25519 offline verifiers |
| 4 | Independent authority authenticated | **Not reached in A2** — resolver remains disabled |

Only state 4 may eventually contribute to operational readiness. None authorize P1 execution in A2.

## A2.1 GitHub repository provenance

- Contract: `M3_3_HV_H4_A3_GITHUB_REPOSITORY_PROVENANCE_ACQUISITION_V1`
- Validates repository identity, stable node id, PR #1954, protected `main`, merge SHA `68d3f913…`, reachability, provider `merged_by` identity.
- GitHub API metadata establishes **repository facts only** — not owner cryptographic ratification.
- Missing owner-authenticated / independently anchored evidence → `OWNER_RATIFICATION_AUTHORITY_UNVERIFIED`.
- Tests use `GITHUB_REST_API_READONLY_FIXTURE` only (no live API in CI).

## A2.2 Independent trust-anchor provisioning

- Contract: `M3_3_HV_H4_A3_INDEPENDENT_TRUST_ANCHOR_PROVISION_V1`
- Future channel: `INDEPENDENT_TRUST_ANCHOR_SERVICE`; tests: `TEST_ISOLATED_FIXTURE`.
- Caller-supplied env/JSON/repo commits **rejected** (`PHASE_A_GOVERNANCE_CALLER_SUPPLIED_TRUST_CANNOT_ESTABLISH_AUTHORITY`).
- `resolvePhaseAGovernanceExternalAuthorityVerifierV1()` remains **unconditionally disabled**.

## A2.3 Deployment probe foundation

- Offline `verifyDeploymentProbeFoundationOfflineV1` — challenge nonce, freshness, replay (ephemeral scope), artifact fingerprint.
- `deploymentShaVerifiedLive=NO`, `productionProbeExecuted=NO`.

## A2.4 PostgreSQL target audit foundation

- Mock catalog snapshot verifier — rejects superuser/privilege escalation fixtures.
- `TARGET_CONFIGURATION_MATCHED` where supported; `LIVE_DATABASE_ROLE_VERIFIED=NO`; no DB connections.

## A2.5 Governance integration

- `buildGovernanceIndependentEvidenceReportV1` — explicit pipeline + provenance reporting.
- `OPERATOR_RISK_ACCEPTANCE_NOT_GRANTED`; MULTI_PARTY_V1 unchanged; SINGLE_OPERATOR_V1 preserved.

## Validation

```bash
cd backend && npm run test:battery:v2:hv-h4
bash architecture/scripts/validate-module-registry.sh
```

Adversarial: `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1b1-a2-independent-provenance.spec.ts`
