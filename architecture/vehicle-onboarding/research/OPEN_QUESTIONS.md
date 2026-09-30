# Vehicle Onboarding — Open Questions (VO-1 inputs)

**Status:** Open — no decision status until VO-1 architecture slice.

| ID | Question |
|----|----------|
| **VO-Q-001** | Should provider candidate become a provider-neutral canonical entity or remain a projection over provider mirrors? |
| **VO-Q-002** | How should one physical vehicle be resolved when it appears through multiple providers? |
| **VO-Q-003** | Should VIN be nullable until verified? |
| **VO-Q-004** | What identity/conflict policy prevents duplicate physical vehicles across organizations/providers? |
| **VO-Q-005** | What lifecycle differentiates discovered, onboarding, active, inactive, disconnected, offboarded, sold/transferred, archived, hard-deleted? |
| **VO-Q-006** | Which states require durable persistence versus derived state? |
| **VO-Q-007** | What is the organization reassignment model and historical data isolation contract? (External ref: B2-06-026) |
| **VO-Q-008** | How is license plate history represented? (External ref: B2-06-025 partial) |
| **VO-Q-009** | How should provider mapping versions/history be preserved? |
| **VO-Q-010** | What exactly constitutes onboarding readiness? |
| **VO-Q-011** | Which technical baselines are mandatory by vehicle/powertrain/product type? |
| **VO-Q-012** | Which capabilities may remain unknown at activation? |
| **VO-Q-013** | When exactly does billing quantity change? |
| **VO-Q-014** | How do DIMO, HM_ONLY and future providers converge on the same orchestration contract? |
| **VO-Q-015** | How should provider disconnection differ from operational deactivation? |
| **VO-Q-016** | How should deregistration/offboarding preserve historical Trips, Battery, Health, Booking, Maintenance and audit evidence? |

**Count:** 16 open design questions.
