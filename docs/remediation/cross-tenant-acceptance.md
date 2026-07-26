# Cross-Tenant Acceptance Testing — Phase 2E.5

**Date:** 2026-07-26  
**Scope:** Authenticated multi-org isolation across critical domains  
**Status:** Implemented (23 acceptance tests)  
**Run:** `cd backend && npm run test:cross-tenant:acceptance`

---

## Executive summary

Phase 2E.5 adds a consolidated **cross-tenant acceptance test suite** using two deterministic organizations (`orgA`, `orgB`) and authenticated tenant user fixtures. Tests deliberately attempt:

- Reading data belonging to another organization
- Modifying foreign entities via manipulated IDs
- Direct UUID access without `organizationId` scoping
- JWT org mismatch (path org ≠ token org)

The suite complements existing per-module security specs (`*-security-negative.spec.ts`, `test:iam:security`) with a **single runnable acceptance net** documented by test case ID.

---

## Test harness

| File | Role |
|------|------|
| `backend/src/test/cross-tenant-acceptance.harness.ts` | Fixture IDs, `buildTenantUser`, guard harness |
| `backend/src/test/cross-tenant-acceptance.*.spec.ts` | Domain-grouped acceptance tests |

### Organizations & users

| Fixture | UUID |
|---------|------|
| `orgA` | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` |
| `orgB` | `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` |
| `userA` (org A admin) | `cccccccc-cccc-4ccc-8ccc-cccccccccccc` |
| `userB` (org B admin) | `dddddddd-dddd-4ddd-8ddd-dddddddddddd` |

Entity UUIDs (`vehicleA/B`, `bookingA/B`, etc.) are deterministic for IDOR reproduction.

---

## Test catalog

### Authentication & org scoping (CT-AUTH)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-AUTH-01 | JWT `organizationId=orgA`, request path `orgB` | `403 Forbidden` before membership lookup | `cross-tenant-acceptance.auth.spec.ts` |
| CT-AUTH-02 | Valid path org, no active membership | `403 Forbidden` | same |
| CT-AUTH-03 | Unauthenticated `fleet.read` | `403 Authentication required` | same |
| CT-AUTH-04 | Matching org + active membership | Allowed | same |

### Vehicles (CT-VEH)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-VEH-01 | `findOne(orgA, vehicleB)` | `null` (no row) | `cross-tenant-acceptance.vehicles-bookings.spec.ts` |
| CT-VEH-02 | UUID-only lookup vs org-scoped lookup | Scoped query returns `null` for foreign vehicle | same |
| CT-VEH-03 | `update` with foreign `vehicleId` + `orgA` | `count: 0` (no mutation) | same |

### Bookings (CT-BKG)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-BKG-01 | `findFirst({ id: bookingB, organizationId: orgA })` | `null` | same |
| CT-BKG-02 | Create booking with foreign `vehicleId` in org A | `NotFoundException` | same |

### Customers (CT-CUS)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-CUS-01 | `findById(orgA, customerB)` | `null` | `cross-tenant-acceptance.customers-documents-invoices.spec.ts` |
| CT-CUS-02 | `update(orgA, customerB, …)` | `NotFoundException` | same |

### Documents (CT-DOC)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-DOC-01 | `getDetail(orgA, docOwnedByOrgB)` | `LegalDocumentNotFoundError` (404, no leak) | same |

### Invoices (CT-INV)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-INV-01 | `findById(invoiceA, orgB)` | `NotFoundException` | same |
| CT-INV-02 | `generatedDocs.getById(orgB, docA)` | `NotFoundException` | same |
| CT-INV-03 | Create invoice in orgA with `customerOtherOrg` | `NotFoundException` | same |

### Analytics / tenant billing (CT-ANA)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-ANA-01 | `getInvoiceDetail(orgA, invoiceWithSubscriptionOrgB)` | `BILLING_INVOICE_NOT_FOUND` | `cross-tenant-acceptance.analytics-dimo-notifications.spec.ts` |
| CT-ANA-02 | Data-analyse `assertVehicle(orgA, vehicleB)` pattern | `NotFoundException` when vehicle not in org | same |

### DIMO (CT-DIMO)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-DIMO-01 | Snapshot plug signal with `organizationId=orgB` on episode owned by `orgA` | `organization_mismatch` reject | same |

### Notifications (CT-NOT)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-NOT-01 | Query `notificationB` with `organizationId=orgA` | `null` (no cross-org row) | same |

### AI (CT-AI)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-AI-01 | `resolveAiVehicleAccess(ctx@orgA, vehicleB)` | `vehicle_not_found` (masked) | `cross-tenant-acceptance.ai-workflows.spec.ts` |
| CT-AI-02 | Tool args `organizationId=orgB` with ctx@orgA | `permission_denied` | same |

### Workflow automation (CT-WF)

| ID | Attack | Expected | File |
|----|--------|----------|------|
| CT-WF-01 | Dry-run workflow in orgA with `vehicleId=vehicleB` | Validation error contains `cross-tenant` | same |
| CT-WF-02 | Executor invoked in `DRY_RUN` mode | Throws — no side effects | same |

---

## Attack patterns exercised

```
┌─────────────────────────────────────────────────────────────┐
│  Attacker: userA @ orgA (JWT organizationId = orgA)        │
├─────────────────────────────────────────────────────────────┤
│  1. Path manipulation    GET /orgs/{orgB}/vehicles/{id}     │
│  2. IDOR                 GET /orgs/{orgA}/vehicles/{vehB}   │
│  3. Body injection       POST booking { vehicleId: vehB }   │
│  4. Direct UUID          prisma.findUnique({ id }) only     │
│  5. AI tool override     { organizationId: orgB } in args   │
└─────────────────────────────────────────────────────────────┘
```

**Defense layers verified:**
1. `OrgScopingGuard` — JWT/path org alignment
2. `PermissionsGuard` — membership + module permissions
3. Service-layer `where: { organizationId }` on all tenant reads/writes
4. Structured 404 (no existence leak) for foreign entity IDs
5. AI execution context — org-bound vehicle resolver, no tool-arg trust

---

## Relationship to existing tests

| Existing suite | Overlap |
|----------------|---------|
| `test:iam:security` | IAM identity, refresh, invites — CT-AUTH extends guard layer |
| `test:vehicles:security` | Vehicle detail negatives — CT-VEH consolidates acceptance |
| `test:bookings:security` | Booking guard stack — CT-BKG adds IDOR scenarios |
| `test:legal-documents:security` | Legal doc negatives — CT-DOC reuses activation harness |
| `invoices.pipeline.integration` | Cases 41–46 — CT-INV references same patterns |
| `notification-access.security.regression` | CT-NOT adds acceptance catalog entry |
| `ai-execution-context.spec` | CT-AI documents foreign vehicle denial |
| `workflow-dry-run.service.spec` | CT-WF documents cross-tenant vehicle validation |

---

## Gaps & follow-up

| Gap | Priority | Recommendation |
|-----|----------|----------------|
| Full HTTP supertest with real JWT (no guard override) | P2 | Add `tenant-acceptance-http.harness.ts` booting AppModule |
| Postgres integration (two real orgs in DB) | P2 | Gate with `CROSS_TENANT_POSTGRES_INTEGRATION=1` |
| Customers dedicated `*-security-negative.spec.ts` | P3 | Extract from acceptance suite |
| Business insights / data-analyse cross-tenant negatives | P3 | Extend CT-ANA with service-level tests |
| Playwright E2E cross-tenant (frontend) | P3 | Un-skip `document-intake-v2-flow.spec.ts` #8 |

---

## CI integration

```bash
cd backend && npm run test:cross-tenant:acceptance
```

Recommended addition to Master Admin remediation CI gate alongside `test:iam:security`.

---

## Related documents

- `docs/remediation/tenant-boundary-validation.md` (2E.1)
- `docs/remediation/concurrency-protection.md` (2E.4)
- `architecture/MASTER_ADMIN_CROSS_TENANT_ACCEPTANCE_2026-07-26.md`
