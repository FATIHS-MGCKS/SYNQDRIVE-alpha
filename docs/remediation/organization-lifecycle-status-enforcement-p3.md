# Organization lifecycle status enforcement (P3)

## Status policy matrix

| Org status | SESSION_ISSUANCE (login/refresh/switch) | TENANT_ONBOARDING | TENANT_OPERATIONAL | MASTER_ADMIN |
|------------|----------------------------------------|-------------------|--------------------|--------------|
| ACTIVE | Allow | Allow | Allow | Allow |
| PENDING | Allow | Allow (profile, invites) | Deny 403 | Allow |
| SUSPENDED | Deny | Deny | Deny 403 | Allow |
| ARCHIVED | Deny | Deny | Deny 403 | Allow |

## Enforcement surfaces

- `OrgScopingGuard` — DB `organization.status` on each `:orgId` tenant route; PENDING onboarding path allow-list.
- `RefreshTokenService` — session issuance + refresh rotation reads current DB status (JWT cannot bypass).
- `OrganizationSwitchService` — target org status checked; list filters non-issuable orgs.

## Explicit exceptions

- **MASTER_ADMIN** — unchanged platform-wide access via guards.
- **Webhooks / workers / M2M** — not modified; no `OrgScopingGuard`.
- **Billing billable vehicles** — existing `ORG_INACTIVE` logic unchanged (orthogonal).

## Uncovered paths (blockers for full coverage claim)

- Routes without `:orgId` that infer tenant only from JWT (no `OrgScopingGuard` activation) — require per-controller audit.
- Background jobs and provider ingress — out of scope for HTTP session policy.

## Compliance mapping (evidence only)

- **GDPR Art. 32 / ISO 27001 A.5.15** — access restricted when org suspended/archived; current DB status enforced at guard and session layer.
- Not legal certification.