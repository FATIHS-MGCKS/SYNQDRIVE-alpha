# EXP-021 S4F-2 — Provider backpressure certification (remediation)

**Base main:** `60f925b2c9720bf4b7ccd16949ef8acf0330e4a8`  
**Gap:** `DI-GAP-S4-PROVIDER-BACKPRESSURE-001` → **CLOSURE_CANDIDATE** (not promoted to CLOSED for Tiny Activation in this PR)

## Certification config (R1)

Redis integration uses `validateDimoProviderBudgetConfig`-valid shapes only:

- `globalLeaseMs >= 5000` (lease expiry test waits real duration)
- `globalMaxInFlight=4`, `reservedHighPrioritySlots=1` → BACKGROUND cap = **3**

## Proven invariants (atomic Redis, two service replicas)

| ID | Property |
|----|----------|
| PB01 | 3× BACKGROUND + 1× HIGH → global in-flight 4; 5th permit `ACQUIRE_TIMEOUT` |
| PB02 | Reserved HIGH slot under **normal admission** (no cooldown) |
| PB11 | Saturation 3 BACKGROUND + 1 HIGH → extra BACKGROUND `ACQUIRE_TIMEOUT` |
| PB06 | Lease expiry with valid `globalLeaseMs` |
| PB07–08 | Shared 429 threshold + cooldown across replicas |
| PB10 | Redis unavailable → `REDIS_UNAVAILABLE` |
| PB27–29 | **Descriptive:** global cooldown blocks HIGH + CRITICAL; recovery after expiry |

## Admission vs cooldown (R7)

| Layer | Behavior |
|-------|----------|
| **Normal admission** | `HIGH_PRIORITY_RESERVED_CAPACITY_PROVEN_NORMAL_ADMISSION=YES` (PB02) |
| **Global provider cooldown** | `HIGH_PRIORITY_AVAILABLE_DURING_GLOBAL_COOLDOWN=NO`, `CRITICAL_AVAILABLE_DURING_GLOBAL_COOLDOWN=NO` (PB27–28) |

Reserved slots do **not** guarantee HIGH/CRITICAL availability during active global cooldown.

## Global cooldown authority (R4)

**EXISTING_ALL_PRIORITY_COOLDOWN_AUTHORITY_FOUND=YES**

- `architecture/P1_3_GLOBAL_DIMO_PROVIDER_BUDGET_FINAL_RESPONSE_2026-08-29.md` — acquire algorithm step 2: cooldown checked before priority / cap logic
- `architecture/scaling-process/DIMO_GLOBAL_PROVIDER_BUDGET.md` — global 429 cooldown metric

**NEW_COOLDOWN_PRIORITY_GAP_REQUIRED=NO** — behavior is documented platform policy; S4 certification is consistent.

**DIMO_429_SCOPE_KNOWN=PARTIAL** — repo documents global Redis cooldown window (`dimo:provider:budget:429_window:{minute}`); external DIMO provider quota scope (global vs endpoint) not verified here.

## Tiny activation

Requires contract gate `DI-GAP-S4-PROVIDER-BACKPRESSURE-001:CLOSED` plus `providerGlobalBudgetEnabled=ENABLED` and operator authorization. **CLOSURE_CANDIDATE ≠ Tiny Activation ready.**

## Not claimed

Production N≈1000 load certification.
