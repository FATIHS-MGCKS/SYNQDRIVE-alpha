# Post-P6 — Monorepo governance correction (P6 closeout architecture)

**Date:** 2026-11-19 (Europe/Berlin)  
**Repository baseline:** `origin/main` @ `34f9ce1bef5101b09191e3619520d378c1163ce5` (post #2448 merge)  
**Epistemic:** **CONFIRMED** from binding [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) (owner 2026-11-16 pause, 2026-11-18 monorepo clarification).

## Correction scope

P6 certification facts in [`BKG-EVID-P6-CERTIFICATION-CLOSEOUT-2026-11-19.md`](../../bookings/evidence/BKG-EVID-P6-CERTIFICATION-CLOSEOUT-2026-11-19.md) remain valid:

- **P6_CERTIFICATION_VERDICT:** GO  
- Disposable Postgres **27/27**  
- Modular workflow certification  
- Production / external-service limitations unchanged  
- Bookings registry: **AUDIT_IN_PROGRESS**

**Superseded (architecture navigation only — historical record in #2448 merge):**

| Superseded recommendation | Superseded by |
|----------------------------|----------------|
| `SYNQDRIVE-CORE_P3+_EXTRACTION_CONTINUATION` | `SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_AUDIT` |
| Physical Core/Rental repository extraction as STEP 1 | Binding monorepo — **PAUSED**; Alpha permanent platform repo |
| Separate Core and Rental production deployables as current requirement | Single NestJS runtime + single deployment on Alpha |
| Rental-to-Core M2M activation as co-located Rental requirement | **REJECTED** for in-process Rental — user JWT + guards |

Do **not** restart `SYNQDRIVE-CORE` extraction roadmap.

## Binding architecture (confirmed)

SYNQDRIVE-alpha: **one** repository, **one** NestJS application, **one** deployment, **one** shared platform database with documented ownership.

| Domain | Owns (summary) |
|--------|----------------|
| **Core** | Master Admin; IAM; entitlements; canonical vehicles/trips; Trip FSM; DS4/DBI; tire/battery/service intelligence; shared infrastructure |
| **Rental** | Bookings; rental customers; payments/contracts; rental rules; rental workflows; rental analysis; `frontend/src/rental` |

| Invariant | Rule |
|-----------|------|
| Core → Rental **business** services | **Forbidden** |
| Rental → Core platform/intelligence | **Allowed** — ports, internal contracts, NestJS DI |
| Co-located Rental auth | User JWT + org scoping + existing guards — **not** M2M-mandatory |

Authoritative refs: master plan § Binding monorepo; [`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md).

## Next executable operation

**`SYNQDRIVE_ALPHA_POST_P6_CORE_RENTAL_BOUNDARY_AUDIT`** — **READ_ONLY_FIRST**

Re-inspect **logical** dependency boundaries inside Alpha (no implementation in the governance-correction PR).

### Inspection surfaces (starting from P4 evidence)

| Surface | P4 baseline | Post-P6 review question |
|---------|-------------|-------------------------|
| Core → Rental service imports / Nest injection | P4-PR1–PR4 ports; **no** VI → rental business services @ `539d7705e` | Any **new** Core modules injecting rental business services since P4 merge baseline? |
| `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` `forwardRef` | **COMPOSITION_ROOT_WIRING** | Unchanged expectation unless composition root refactored |
| `prisma.booking` reads in VI trip/attribution/damage | **NEEDS_FURTHER_EVIDENCE** (out of P4 violation scope) | Classify per ownership + P4 contract — not automatic violation |
| `BookingsModule` → rental driving analysis | **ALLOWED_INTRA_RENTAL** | Confirm still rental-owned orchestration |
| Shared workers / Bull queues crossing domains | Not exhaustively audited in P4 | Document boundaries; do not assume violation without evidence |
| Frontend ownership | Rental vs master vs operator surfaces | Confirm route ownership vs product guards |

### Classification vocabulary (per finding)

1. **CONFIRMED_ARCHITECTURE_VIOLATION** — Core module depends on Rental business-logic service (forbidden invariant).  
2. **ALLOWED_IN_PROCESS_DEPENDENCY** — Rental consumes Core platform; composition-root port binding; intra-rental coupling.  
3. **NEEDS_FURTHER_EVIDENCE** — e.g. direct `prisma.booking` in intelligence paths; requires ownership + contract review before violation claim.

### Deliverable (future workstream)

Evidence record + optional registry/authority updates; **no** runtime changes unless a separate implementation PR is authorized.

## Agent governance guardrails (binding)

Enforced via root [`AGENTS.md`](../../../AGENTS.md) § **Binding Core/Rental monorepo guardrails** and [`.cursor/rules/projektregel.mdc`](../../../.cursor/rules/projektregel.mdc) § Core/Rental monorepo dependency policy — dependency invariants, new-module ownership checklist, future-application **interface readiness** (no live integration in ordinary agent work).

## Validation (this correction PR)

```bash
bash architecture/bookings/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
git diff --check
```