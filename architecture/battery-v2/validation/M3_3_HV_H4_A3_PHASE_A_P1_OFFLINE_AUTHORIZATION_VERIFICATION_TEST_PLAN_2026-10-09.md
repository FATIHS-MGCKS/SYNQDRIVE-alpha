# Offline verification test plan — P1 trusted authorization (P1B0)

**Module:** `m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.verify-offline.v1.ts`  
**Runtime integration:** **none** (P1 execution remains `NO_GO`).

## Commands

```bash
cd backend && npx jest m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.verify-offline.v1.spec.ts
cd backend && npm run test:battery:v2:hv-h4
```

## Fixture signing (tests only)

Unit tests use `crypto.generateKeyPairSync('ed25519')` — **never** commit private keys. Operator production signing uses the same canonicalization rules via a future ops script (out of repo).

## Test matrix

| ID | Case | Expected |
|----|------|----------|
| T01 | Valid signature, all bindings match synthetic context | `ok: true` |
| T02 | Tampered payload field after sign | `SIGNATURE_INVALID` |
| T03 | Wrong public key / keyId | `SIGNATURE_INVALID` or `TRUST_KEY_NOT_FOUND` |
| T04 | Revoked keyId in trust store | `TRUST_KEY_REVOKED` |
| T05 | Expired `expiresAtUtc` | `AUTHORIZATION_EXPIRED` |
| T06 | Maintenance window end before `now` | `MAINTENANCE_WINDOW_CLOSED` |
| T07 | `authorizedReleaseSha` mismatch vs context | `RELEASE_SHA_MISMATCH` |
| T08 | `postgresTargetFingerprint` mismatch | `POSTGRES_TARGET_MISMATCH` |
| T09 | `queryManifestFingerprint` mismatch vs runtime compute | `QUERY_MANIFEST_MISMATCH` |
| T10 | Any `authorizationLimits` true | `AUTHORIZATION_LIMITS_FORBIDDEN` |
| T11 | `governanceMode` not `SINGLE_OPERATOR_V1` | `GOVERNANCE_MODE_UNSUPPORTED` |
| T12 | Malformed base64 signature | `SIGNATURE_MALFORMED` |
| T13 | Missing required schema field | `SCHEMA_INVALID` |
| T14 | `auditRoleLogin` does not match fingerprint login | `AUDIT_LOGIN_MISMATCH` |
| T15 | Approval binding window inconsistent (`validUntil` < `validFrom`) | `APPROVAL_WINDOW_INVALID` |
| T16 | Trust key past `notAfterUtc` | `TRUST_KEY_EXPIRED` |
| T17 | Signature over wrong canonical bytes (key order) | `SIGNATURE_INVALID` |
| T18 | Verifier called with production execution context flag | still returns verify result only — **does not** set `p1Authorization` |
| T19 | Import `resolvePhaseAProductionP1AuthorizationV1` from verifier module | **forbidden** — no import edge |
| T20 | Regression: `resolvePhaseAProductionP1AuthorizationV1` unchanged `NO_GO` | `verify-offline.v1.spec.ts` |
| H1-T21 | KeyId substitution after sign | `SIGNATURE_INVALID` (signed header binds `signingKeyId`) |
| H1-T22 | Duplicate SPKI alias under two keyIds in trust store | `TRUST_STORE_DUPLICATE_KEY_ALIAS` |
| H1-T23 | Approval binding expired while `expiresAtUtc` still future | `APPROVAL_BINDING_EXPIRED` |
| H1-T24 | Unknown JSON field on artifact | `SCHEMA_INVALID` |
| H1-T25 | `liveDeploymentIdentityVerified: true` in context | `VERIFY_CONTEXT_LIVE_IDENTITY_UNVERIFIED_REQUIRED` |

**P1B0-H1 (2026-10-09):** Canonical payload uses domain-separated `signingHeader` (algorithm, keyId, contract version, purpose, scope) + `authorizationBody`; only `detachedBase64` is unsigned. Live deployment identity remains **UNVERIFIED** in fixtures (`liveDeploymentIdentityVerified: false`).

| H2-T26 | Trust store: padded vs unpadded same Ed25519 SPKI, different keyIds | `TRUST_STORE_DUPLICATE_KEY_ALIAS` |
| H2-T27 | Trust store: revoked keyId + active alias same SPKI | `TRUST_STORE_DUPLICATE_KEY_ALIAS` (no bypass) |
| H2-T28 | Artifact `2026-02-30` issuedAt | `TEMPORAL_INSTANT_INVALID` |
| H2-T29 | Verification `now: NaN` | `VERIFICATION_CLOCK_INVALID` |

| H3-T30 | Canonical Ed25519 SPKI export | accept |
| H3-T31 | SPKI + trailing zero byte (canonical Base64) | `TRUST_KEY_SPKI_DER_NONCANONICAL` |
| H3-T32 | Long-form outer SEQUENCE ASN.1 encoding | `TRUST_KEY_SPKI_DER_NONCANONICAL` |
| H3-T33 | Revoked keyId + trailing-DER alias keyId | fail-closed (DER or duplicate alias) |

## Security checks (static)

- Grep: verifier module must not import `runM3_3HvH4A3PhaseAPreflightV1`, `createPhaseAProductionPrismaClientV1`, or mutate `process.env` production URLs.
- Grep: no `PRIVATE` key paths in architecture except “forbidden” documentation.

## Evidence

Record Jest output + commit SHA in change ledger when P1B1 integrates execution wiring.
