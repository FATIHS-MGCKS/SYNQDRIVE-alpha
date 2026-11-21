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
- `VehicleOwnershipGuard` — ACTIVE membership + vehicle org + `TENANT_OPERATIONAL` lifecycle (implicit `:vehicleId` routes).
- `RefreshTokenService` — session issuance + refresh rotation reads current DB status (JWT cannot bypass).
- `OrganizationSwitchService` — target org status checked; list and switch response filter non-issuable orgs.
- `PATCH /vehicles/:vehicleId` — `fleet.write` via `PermissionsGuard` (aligned with org-scoped fleet mutations).

## Explicit exceptions

- **MASTER_ADMIN** — unchanged platform-wide access via guards.
- **Webhooks / workers / M2M** — not modified; no `OrgScopingGuard`.
- **Billing billable vehicles** — existing `ORG_INACTIVE` logic unchanged (orthogonal).

## Implicit route inventory (P3 closeout)

| Area | Guard / policy | Classification |
|------|----------------|----------------|
| `vehicles/:vehicleId` (GET/PATCH/exterior-images) | `VehicleOwnershipGuard` + lifecycle | **PROTECTED** |
| `VehicleIntelligenceController` (`vehicles/:vehicleId/*`) | class `VehicleOwnershipGuard` | **PROTECTED** |
| `DocumentExtractionController` vehicle routes | `VehicleOwnershipGuard` + `PermissionsGuard` | **PROTECTED** |
| `organizations/:orgId/*` operational | `OrgScopingGuard` | **BLOCKED_BY_EXISTING_POLICY** |
| Booking mutations | `OrgScopingGuard` on org paths | **BLOCKED_BY_EXISTING_POLICY** |
| User/role org admin | org-scoped guards | **BLOCKED_BY_EXISTING_POLICY** |
| Product ops (org routes) | `OrgScopingGuard` / license guards | **BLOCKED_BY_EXISTING_POLICY** |
| Webhooks, workers, M2M | none (by design) | **NOT_VERIFIED** (out of HTTP session scope) |

## Uncovered paths (blockers for full coverage claim)

- Residual handlers that set tenant only from JWT with **no** ownership/org guard — per-handler audit still required.
- Background jobs and provider ingress — out of scope for HTTP session policy.

## Compliance mapping (evidence only)

- **GDPR Art. 32 / ISO 27001 A.5.15** — access restricted when org suspended/archived; current DB status enforced at guard and session layer.
- Not legal certification.