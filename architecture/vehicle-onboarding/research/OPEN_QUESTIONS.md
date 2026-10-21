# Vehicle Onboarding — Open Questions

**VO-1 status (2026-09-30):** All **VO-Q-001 … VO-Q-016** **DECIDED** — see [VO1_QUESTION_RESOLUTIONS.md](./VO1_QUESTION_RESOLUTIONS.md) for full decision records.

| ID | Summary decision | Status |
|----|------------------|--------|
| **VO-Q-001** | Mirrors + OnboardingCase; candidate = projection | **DECIDED** |
| **VO-Q-002** | Tiered VIN + admin multi-provider resolution | **DECIDED** |
| **VO-Q-003** | VIN nullable until verified | **DECIDED** |
| **VO-Q-004** | Org-scoped conflict + cross-tenant internal-only | **DECIDED** |
| **VO-Q-005** | Separate registry lifecycle from VehicleStatus | **DECIDED** |
| **VO-Q-006** | Minimal persisted vs derived classification | **DECIDED** |
| **VO-Q-007** | Org assignment history + isolation on transfer | **DECIDED** |
| **VO-Q-008** | Temporal license plate history | **DECIDED** |
| **VO-Q-009** | Link-episode provider mapping history | **DECIDED** |
| **VO-Q-010** | Context-aware readiness checklist | **DECIDED** |
| **VO-Q-011** | Mandatory baselines by readiness profile | **DECIDED** |
| **VO-Q-012** | Conditional UNKNOWN capabilities at activation | **DECIDED** |
| **VO-Q-013** | Billing quantity on activation/offboard facts | **DECIDED** |
| **VO-Q-014** | OnboardingSourceSnapshot orchestration contract | **DECIDED** |
| **VO-Q-015** | Disconnect ≠ deactivate ≠ delete | **DECIDED** |
| **VO-Q-016** | Offboard preserves history; hard-delete exceptional | **DECIDED** |

**Counts:** 16 total · 16 DECIDED · 0 DEFERRED · 0 BLOCKED

Original question text (historical):

| ID | Question |
|----|----------|
| VO-Q-001 | Should provider candidate become a provider-neutral canonical entity or remain a projection over provider mirrors? |
| VO-Q-002 | How should one physical vehicle be resolved when it appears through multiple providers? |
| VO-Q-003 | Should VIN be nullable until verified? |
| VO-Q-004 | What identity/conflict policy prevents duplicate physical vehicles across organizations/providers? |
| VO-Q-005 | What lifecycle differentiates discovered, onboarding, active, inactive, disconnected, offboarded, sold/transferred, archived, hard-deleted? |
| VO-Q-006 | Which states require durable persistence versus derived state? |
| VO-Q-007 | What is the organization reassignment model and historical data isolation contract? |
| VO-Q-008 | How is license plate history represented? |
| VO-Q-009 | How should provider mapping versions/history be preserved? |
| VO-Q-010 | What exactly constitutes onboarding readiness? |
| VO-Q-011 | Which technical baselines are mandatory by vehicle/powertrain/product type? |
| VO-Q-012 | Which capabilities may remain unknown at activation? |
| VO-Q-013 | When exactly does billing quantity change? |
| VO-Q-014 | How do DIMO, HM_ONLY and future providers converge on the same orchestration contract? |
| VO-Q-015 | How should provider disconnection differ from operational deactivation? |
| VO-Q-016 | How should deregistration/offboarding preserve historical Trips, Battery, Health, Booking, Maintenance and audit evidence? |
