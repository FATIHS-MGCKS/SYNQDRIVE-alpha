# Operator signing ceremony & trust-store provisioning (future P1B1+)

**Status:** DOCUMENTATION ONLY — P1B1-A0 does not generate, install, or distribute private keys.

## Private key locus (forbidden elsewhere)

| Location | Private Ed25519 signing key |
|----------|----------------------------|
| Git repository | **Forbidden** |
| CI / Cursor Cloud Agents | **Forbidden** |
| Production application / audit runner | **Forbidden** |
| Operator workstation / hardware token | **Required signing locus** |

Public trust material (`keyId`, SPKI DER Base64) may be distributed read-only via operator-controlled trust bundles injected at runtime in a future slice.

## Future signing ceremony (outline)

1. Complete R4.2A admission + operational readiness under active governance mode.
2. Record change-specific `operatorRiskAcceptance` (Authority A).
3. Attach optional `aiTechnicalReviewAdvisory` (Authority B, non-authorizing).
4. Build canonical P1 trusted authorization payload from approved bindings (approval id, nonce, manifest fingerprint, policy ids).
5. Sign locally with Ed25519; store detached signature + JSON artifact in evidence destination.
6. Register public key in trust store with canonical SPKI DER; rotate via new `keyId` + `revokedKeyIds`.

## Independent evidence still required before execution `GO` (future)

| Evidence | P1B1-A0 status |
|----------|----------------|
| Running release SHA & deployment identity | **UNVERIFIED** (no production probe in A0) |
| PostgreSQL target & dedicated read-only audit role | Declarative only; not live-verified |
| Trusted public-key provisioning & revocation procedure | Documented; no live trust store in repo |
| Change-ticket approval & operator risk acceptance | Per-change; not auto-granted by policy adoption |
| Atomic one-time authorization consumption | R4.2A consumption store; execution still `NO_GO` |

## Revocation

Compromised `keyId` → add to `revokedKeyIds`; invalidate outstanding artifacts by temporal bounds; re-issue under new key after incident review.
