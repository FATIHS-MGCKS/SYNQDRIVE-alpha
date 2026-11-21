# Engineering compliance standard (SYNQDRIVE-alpha)

**Status:** `BINDING` — engineering requirements for future changes  
**Scope:** SYNQDRIVE-alpha (Core + Rental logical domains, single runtime)  
**Not claimed:** ISO certification, legal sign-off, DPO approval, or production compliance attestation without explicit evidence records.

**Related authorities:** [`../dsrg/`](../dsrg/) (deploy guards), [`../internationalization/`](../internationalization/) (i18n governance), [`../platform-reorientation/MONOREPO_AGENT_GUARDRAILS.md`](../platform-reorientation/MONOREPO_AGENT_GUARDRAILS.md) (Core/Rental boundaries).

---

## Status vocabulary

Use separately and never merge:

| Label | Meaning |
|-------|---------|
| **IMPLEMENTED** | Code or configuration exists on a branch |
| **TESTED** | Automated or recorded manual verification |
| **MERGED** | On `origin/main` |
| **DEPLOYED** | On Production VPS with attested SHA |
| **PRODUCTION_VERIFIED** | Read-only or controlled production evidence |
| **COMPLIANCE_REVIEWED** | Documented applicability assessment + engineering controls recorded |
| **CERTIFIED** | External certification or formal legal conclusion — **owner/legal only** |

---

## Security engineering

- **Secure by design and default** — fail-closed feature flags; deny-by-default authZ.
- **Least privilege** — RBAC, org/tenant isolation, product entitlements, vehicle-scoped access.
- **Authentication and secrets** — no secrets in git or agent transcripts; rotateable credentials; MFA where MA policies require (see P5 ledger).
- **Encryption** — TLS in transit for external surfaces; at-rest per infrastructure contracts (VPS, DB provider).
- **Audit and monitoring** — privileged actions, security-relevant denials, and deploy mutations traceable (DSRG, activity logs where implemented).
- **Dependencies** — CI and owner review for vulnerability findings; no silent bypass of production DB guards.
- **Deploy and rollback** — owner-authorized production deploy only; CI gate non-bypassable per `AGENTS.md`.
- **Risk and evidence** — substantive security changes document threat, scope, validation, and residual risk in module authority or change records.

---

## Privacy engineering (GDPR / DSGVO / BDSG alignment)

- **Purpose limitation and data minimization** — collect and retain only fields required for stated product purpose.
- **Roles and legal bases** — document controller/processor roles and processing purposes in module/compliance artifacts when personal data is added or scope changes.
- **Privacy-friendly defaults** — restrictive defaults for optional processing (analytics, marketing, broad location history).
- **Retention and deletion** — define retention per data class; support erasure workflows where product scope requires.
- **Data subject rights** — design for access, export, and erasure where applicable; do not block lawful operator workflows without owner decision.
- **Transfers** — third-country or subprocessors require documented assessment before new integrations.
- **DPIA/DSFA** — trigger assessment when high-risk processing (systematic location/driver monitoring, profiling at scale) is introduced or materially changed.
- **Vehicle location and driver monitoring** — tenant-scoped access; no silent broad location logging in analytics; respect product consent/permission UX.
- **Consent and permissions** — separate product consent flows from purely technical cookies/device access (see TDDDG).
- **Logs** — no unnecessary personal data (PII, precise locations, raw tokens) in application or debug logs.

---

## Cookies and end-device access (TDDDG §25)

For web, mobile SDKs, and equivalent technologies:

1. **Determine applicability** of §25 TDDDG for each surface (strictly necessary vs consent-based).
2. **Document** necessity or consent requirement in the owning module/UX authority before shipping optional tracking.
3. **No optional tracking** before valid consent where required.
4. **Align** with existing consent/permission components — do not add parallel cookie banners without owner decision.

---

## EU Data Act (Regulation (EU) 2023/2854)

When connected-vehicle or user-generated vehicle data is shared with third parties:

1. **Applicability and role** — record whether SynqDrive acts as holder, user, or third party for the specific flow.
2. **Access and portability** — technical interfaces and export paths must respect GDPR for personal data.
3. **Third-party contracts** — provider boundaries documented before production activation.
4. **Interaction with GDPR** — personal data stays under GDPR; non-personal vehicle/telemetry rules under Data Act where applicable.

Do **not** claim full Data Act compliance without legal review and product-specific evidence.

---

## ISO 27001 / ISO 27701 governance (engineering — not certification)

- **ISMS/PIMS scope** — Alpha monorepo + documented VPS production; separate product repos when connected.
- **Asset and risk registers** — module authorities and security invariants are living registers; update on substantive change.
- **Controls and evidence** — map implemented controls to change records; no unsupported “control satisfied” labels.
- **Incident and access** — follow DSRG and owner runbooks for production access; agents read-only on Production unless explicitly authorized.
- **Internal review readiness** — evidence append-only; audits reference SHAs and environments.
- **No unsupported certification claims** in code, docs, or marketing.

---

## New feature gate (security / privacy relevance)

When a change **materially** affects authentication, authorization, personal data, location/driver monitoring, cookies/device access, external data sharing, crypto, or production deploy guards:

| Step | Requirement |
|------|-------------|
| 1 | **Applicability assessment** — which of the sections above apply (short note in PR or authority) |
| 2 | **Implementation** — controls per this standard and existing security invariants |
| 3 | **Tests** — targeted automated or recorded manual tests appropriate to risk |
| 4 | **Evidence** — traceable artifact (authority update, evidence/*.md, or compliance appendix) |
| 5 | **Blockers** | Explicit open items — do not mark **COMPLIANCE_REVIEWED** with unresolved P0 gaps |

**Out of scope for automatic failure:** cosmetic UI, non-PII refactors, docs-only typo fixes, unrelated module changes — do not force compliance paperwork on every PR.

**Prohibited without owner approval:** new compliance frameworks duplicating DSRG/guards; parallel security databases; duplicate entitlement or IAM systems.

---

## Agent routing

1. Read this standard when implementing Master Admin, IAM, M2M, telematics/location, communications, billing with PII, or cross-tenant data flows.
2. Update **module authority** + **progress evidence** in the same PR when compliance boundaries change.
3. Run existing validators (`validate-module-registry.sh`, i18n checks, production DB guard bundle integrity when touching guard scripts).

**Last updated:** 2026-11-20 (Europe/Berlin) — governance documentation PR; `origin/main` @ `2e39a894a`.