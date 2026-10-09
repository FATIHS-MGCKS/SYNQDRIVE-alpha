# Governance contract — Single-operator production Phase-A (V1)

**Contract ID:** `M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1`  
**Status:** `PROPOSED` — **requires explicit human policy approval** before any runtime mode switch.  
**Does not authorize production execution** by itself.

## 1. Purpose

Define how a **single human owner/operator** may govern production Phase-A read-only audits without pretending that an AI reviewer is a second human verifier.

## 2. Three authorities (normative)

### 2.1 Human owner/operator (Authority A)

- Owns the change ticket, maintenance window, stop conditions, and **explicit acceptance of residual risk**.
- May delegate **technical** work to AI tools; **cannot** delegate **legal/operational accountability**.
- Records acceptance in `operatorRiskAcceptance` (see §4) — **not** equivalent to machine `GO`.

### 2.2 AI-assisted technical review (Authority B)

- Optional, **advisory** evidence attached to a change record or PR.
- Must be labeled `aiTechnicalReviewAdvisory` with:
  - `reviewerKind: AI_ASSISTED` (never `HUMAN`)
  - `nonAuthorizing: true`
  - `scope: TECHNICAL_ADVISORY_ONLY`
- **Forbidden:** using AI agent email, “Cursor”, or “Cloud Agent” as `independentAuthorizationVerification.verifierIdentity`.
- Readiness check mapping: `AI_TECHNICAL_REVIEW_ADVISORY` → status `SKIP` or `PASS` on **advisory completeness only** — never on `EXTERNAL_HUMAN_AUTHORIZATION_AUTHENTICATION`.

### 2.3 Machine execution authorization (Authority C)

- Only path that may eventually set `p1Authorization=GO` (future **P1B1** integration).
- Requires valid `M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_V1` + trusted public key + existing R4.2A admission + consumption.
- P1B0: verifier exists **offline only**; runtime remains `NO_GO`.

## 3. Policy supersession (two-human verifier)

Three authorities (§2) remain **separate**. Owner-operated mode changes **which human records** satisfy offline readiness — it does **not** remove the need for explicit human policy approval (§7) or cryptographic Authority C for execution.

| When | Rule |
|------|------|
| **Default (multi-party governance)** | `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1` requires distinct human `independentAuthorizationVerification` for readiness and activation paths that reference two-human policy. |
| **Owner-operated mode (this contract V1, PROPOSED)** | Org **owner** documents supersession: acceptance of `M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1` in change policy (append-only ledger). Offline readiness **substitutes** `operatorRiskAcceptance` for the **second human verifier field** — **not** for Authority C. AI technical review (Authority B) remains **advisory only** and is **never** a second human. |
| **Activation while PROPOSED** | `REQUIRES_HUMAN_POLICY_APPROVAL=YES` — runtime `p1Authorization` stays `NO_GO`; no mode switch until §7 boxes are checked. An unavailable second human is **not** unconditionally required when owner-operated supersession is **documented**; until then, default two-human rules apply. |
| **Never** | Fabricated verifier identities; AI listed as human verifier; silent deletion of two-human policy without documented supersession + `governanceMode: SINGLE_OPERATOR_V1`. |

**Versioning:** material policy changes require a **new governance contract version** (V1 → V2) and append-only ledger entry. Supersession **extends** policy; it does not erase historical two-human requirements from the ledger.

## 4. Record shapes (governance JSON, non-executing)

### 4.1 `operatorRiskAcceptance` (human, documented)

```json
{
  "contractVersion": "M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_V1",
  "operatorIdentity": "owner@example.com",
  "changeTicket": "CHG-0001",
  "acceptedAtUtc": "2026-10-09T12:00:00.000Z",
  "attestation": "I accept operational risk for Phase-A read-only audit under stated stop conditions.",
  "governanceMode": "SINGLE_OPERATOR_V1"
}
```

This record is **not** cryptographically sufficient for execution without Authority C.

### 4.2 `aiTechnicalReviewAdvisory` (optional)

```json
{
  "contractVersion": "M3_3_HV_H4_A3_AI_TECHNICAL_REVIEW_ADVISORY_V1",
  "reviewerKind": "AI_ASSISTED",
  "nonAuthorizing": true,
  "tooling": "Cursor Cloud Agent",
  "reviewedAtUtc": "2026-10-09T11:00:00.000Z",
  "repositoryHeadSha": "34555d6653cf7b9314d8385f056baee7231c1c06",
  "findingsSummary": "P1 gate blocks connect; migration secrets rejected.",
  "limitations": "Not independent human approval; advisory only."
}
```

## 5. Signing key separation

| Location | Private signing key | Public trust material |
|----------|--------------------|------------------------|
| Git repository | **Forbidden** | Allowed: **key id + algorithm only** (no raw pubkey required in repo) |
| CI / Cloud Agent | **Forbidden** | Trust store path may be injected at runtime in future P1B1 — not in P1B0 |
| Production app / audit runner env | **Forbidden** | Read-only trust store path acceptable in future P1B1 |
| Operator workstation / hardware token | **Required signing locus** | Export pubkey to operator trust bundle |

**Rotation:** new `keyId`, overlap trust window, revoke compromised `keyId` in trust store `revokedKeyIds` list.  
**Compromise recovery:** revoke key, invalidate outstanding signed artifacts by `expiresAtUtc`, re-issue under new key after incident review.

## 6. Operator signing process (out of band)

1. Complete offline readiness (`READY`) and human risk acceptance record.
2. Build canonical P1 authorization payload from approved R4.2A artifacts (approval id, nonce, target spec, release SHA, deployment probe output).
3. Sign with Ed25519 private key **locally** (script template in validation test plan — not run in CI).
4. Store detached signature + payload JSON in evidence destination; never commit private key or production URLs.

## 7. Activation gate (human policy)

Before any code enables `SINGLE_OPERATOR` readiness branching or execution `GO`, the **owner/operator (Authority A)** must complete the mandatory checklist below. This contract remains **`PROPOSED`** until the owner explicitly adopts it in org change policy — agents must **not** generate or simulate operator approval.

### 7.0 Mandatory checklist (all paths)

- [ ] Owner documents acceptance of this contract in org change policy (append-only ledger entry).
- [ ] Trust store provisioning procedure reviewed.
- [ ] `operatorRiskAcceptance` recorded for the change (Authority A) — separate from machine `GO` (Authority C).

### 7.1 Security review path (choose one documented path)

| Path | When | Requirement |
|------|------|-------------|
| **A — Multi-party default** | Two-human / independent-verifier governance still active | Independent **human** security review of the P1B1 integration PR. AI review may be attached only as §4.2 **advisory** — never as the human reviewer. |
| **B — Single-operator exception** | Owner-operated supersession per §3 is **documented** and `governanceMode: SINGLE_OPERATOR_V1` applies | Owner documents the **single-operator security-review exception**: explicit owner acceptance that no separate human security reviewer is available, with **residual risk** acknowledged in `operatorRiskAcceptance` (including security-review scope). Optional §4.2 AI advisory may supplement but **does not** satisfy this path. |

**Non-waivable external duties:** Mandatory **legal, regulatory, or organizational separation-of-duties** requirements imposed on the organization (outside this repository) **cannot** be self-waived by this contract or by an AI agent. Where external SoD mandates a distinct human control, Path B does **not** apply until org counsel/compliance confirms otherwise.

### 7.2 Status

**`REQUIRES_HUMAN_POLICY_APPROVAL=YES`** and **`OWNER_POLICY_APPROVAL=STILL_REQUIRED`** until §7.0 and one §7.1 path are satisfied by the owner — not by automated or AI simulation.
