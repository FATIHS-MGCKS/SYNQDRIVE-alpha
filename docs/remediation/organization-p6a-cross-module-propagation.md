# P6A — Cross-module lifecycle propagation seal (evidence)

Base: `main` @ P5B3 merge. **No automatic org suspend on billing PAST_DUE** (policy unchanged).

## Scenario A — Organization ACTIVE → SUSPENDED

| Surface | Classification | Evidence |
|---------|----------------|----------|
| Tenant HTTP operational routes | **VERIFIED_PASS** | P3 `OrgScopingGuard` + `VehicleOwnershipGuard`; P5B1 scenario G (stale JWT); `vehicle-ownership-lifecycle.http-security.integration.spec.ts` |
| Session refresh / issuance | **VERIFIED_PASS** | `refresh-token-organization-lifecycle.spec.ts` |
| DIMO snapshot **scheduler** cohort | **POLICY_DECISION** | `dimo-snapshot.scheduler.ts` filters `registryLifecycle: ACTIVE` + connectivity — **no** `organization.status`. P6A test documents intentional telemetry continuity until vehicle offboard. |
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
| Product-gated HTTP | **VERIFIED_PASS** | P6A static test: all `ProductLicenseGuard` controllers include `OrgScopingGuard` |
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