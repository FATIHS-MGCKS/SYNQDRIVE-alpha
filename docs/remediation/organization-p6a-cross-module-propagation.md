# P6A — Cross-module lifecycle propagation seal (evidence)

Base: `main` @ P5B3 merge. **No automatic org suspend on billing PAST_DUE** (policy unchanged).

## Evidence precision (P6A closeout)

| Claim type | Meaning |
|------------|---------|
| **VERIFIED_PASS** | Runtime or policy unit tests prove behavior for the stated surface. |
| **PARTIAL** | Static/repo inventory or cohort-query shape only — not per-route HTTP runtime proof. |
| **NOT_TESTED** | No test or audit reproduction in this workstream. |
| **PRODUCT_DECISION_REQUIRED** | Code fact established; whether behavior is desired is an owner/product decision. |
| **NOT_APPLICABLE** | Surface does not apply to the transition. |

Do not upgrade **NOT_TESTED** to **VERIFIED_PASS**.

## Scenario A — Organization ACTIVE → SUSPENDED

| Surface | Classification | Evidence |
|---------|----------------|----------|
| Tenant HTTP operational routes | **VERIFIED_PASS** | P3 `OrgScopingGuard` + `VehicleOwnershipGuard`; P5B1 scenario G (stale JWT); `vehicle-ownership-lifecycle.http-security.integration.spec.ts` |
| Session refresh / issuance | **VERIFIED_PASS** | `refresh-token-organization-lifecycle.spec.ts` |
| DIMO snapshot **scheduler** cohort query | **VERIFIED_PASS** (query shape) | `dimo-snapshot.scheduler.ts` + `dimo-snapshot.scheduler.spec.ts` P6A assertion: cohort `where` has **no** `organization` / `organizationId` / `organization.status` filter. |
| DIMO snapshot **scheduler** — SUSPENDED org telemetry | **PRODUCT_DECISION_REQUIRED** | Confirmed: scheduler does not exclude SUSPENDED organizations. **Not proven** whether continued collection is intended; owner must decide (e.g. continue until vehicle offboard vs pause on org suspend). |
| DIMO snapshot **processor** | **VERIFIED_PASS** (vehicle registry) | `dimo-snapshot.processor.registry-lifecycle.spec.ts` skips OFFBOARDED |
| Trip tracking / recovery | **NOT_TESTED** (org status) | Workers scope by vehicle/org id; no org lifecycle gate located |
| DIMO / provider webhooks | **NOT_TESTED** (org status) | Vehicle binding + org on record; no SUSPENDED org gate in webhook ingress |
| Billing quantity | **VERIFIED_PASS** | `ORG_INACTIVE` in `billable-vehicle-policy`; characterization in P6A spec |
| Voice MCP / HM register | **VERIFIED_PASS** | P5B3 + P5B2 lifecycle on request path |

## Scenario B — Product ACTIVE → non-operational

| Surface | Classification | Evidence |
|---------|----------------|----------|
| `ProductLicenseGuard` | **VERIFIED_PASS** | ACTIVE org product row only (`entitlements-policy.ts`) |
| Vehicle activation | **VERIFIED_PASS** | P5B1 scenario C; `resolveEntitlementCapabilities` — TRIAL/SUSPENDED block activation |
| Product-gated HTTP (`ProductLicenseGuard` + `OrgScopingGuard`) | **PARTIAL** | P6A **static controller-file** inventory: every `*.controller.ts` referencing `ProductLicenseGuard` also references `OrgScopingGuard` (0 misses at closeout). Does **not** prove handler-level guard order, method-level overrides, or non-controller routes. Runtime HTTP proof remains P3 org-scoped routes + existing integration specs. |
| Background jobs | **NOT_APPLICABLE** | Product guard is HTTP-scoped |

## Scenario C — Billing ACTIVE → PAST_DUE

| Surface | Classification | Evidence |
|---------|----------------|----------|
| Stripe → subscription row | **VERIFIED_PASS** | `subscription-lifecycle.service.spec.ts` |
| Organization.status | **NOT_APPLICABLE** | No `organization.update` in subscription lifecycle / stripe webhook dispatcher (repo grep) |
| Product entitlement row | **NOT_APPLICABLE** | Not auto-revoked on PAST_DUE (manual/MA product ops) |
| Tenant fleet HTTP | **VERIFIED_PASS** (continues) | Org remains ACTIVE → `OrgScopingGuard` allows ops unless MA suspended org |
| MA attention | **VERIFIED_PASS** | `buildOrganizationAttention` — `PAST_DUE` vs `ORG_SUSPENDED` independent (P6A spec) |

## Scenario D — Vehicle ACTIVE → OFFBOARDED

| Surface | Classification | Evidence |
|---------|----------------|----------|
| Registry lifecycle | **VERIFIED_PASS** | `isVehicleRegistryOperationalActive`; processor skip spec |
| Scheduler eligibility | **VERIFIED_PASS** | Scheduler `registryLifecycle: 'ACTIVE'` query |
| Billing quantity | **VERIFIED_PASS** | `REGISTRY_OFFBOARDED` exclusion (P6A spec) |
| Historical trips/data | **POLICY_DECISION** | Retention not purged on offboard (existing rules) |

## Confirmed defects (P6A)

None newly demonstrated beyond P6 full audit backlog (worker org lifecycle **NOT_TESTED**, not reclassified as FAIL without reproduction).