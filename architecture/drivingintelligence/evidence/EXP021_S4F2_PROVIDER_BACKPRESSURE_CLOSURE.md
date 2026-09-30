# EXP-021 S4F-2 — Provider backpressure certification & gap closure

**Base main:** `60f925b2c9720bf4b7ccd16949ef8acf0330e4a8`  
**Gap:** `DI-GAP-S4-PROVIDER-BACKPRESSURE-001` → **CLOSED** (certification slice; S4 still dormant)

## Safety properties (proven scope)

| Invariant | Proof |
|-----------|--------|
| Global concurrency | Two `DimoProviderBudgetService` instances + shared Redis; `PB01` / `MR01` — in-flight ≤ `globalMaxInFlight` (test config 4) |
| BACKGROUND low-priority cap | `PB02` / `MR02` — cap = `max - reserved` (3 when max=4, reserved=1); 4th BACKGROUND blocked; HIGH still acquires |
| Shared 429 cooldown | `PB07`/`PB08` / `MR05` — replica A records threshold; replica B blocked until cooldown expires |
| Redis fail-closed | `PB10` / `MR06` — `DimoProviderBudgetError` `REDIS_UNAVAILABLE`; no permit |
| Lease recovery | `PB06` / `MR04` — unreleased permit expires; capacity returns |
| S4 bypass prohibition | `DI_V0_S4C_DIMO_REQUEST_CONTEXT` frozen; `PB17`/`PB18` — parent `bypassBudget=true` does not infect S4 ALS context |
| Global budget disabled unsafe for activation | `providerGlobalBudgetEnabled` gate — `PB23`/`PB24` |
| Shared transport retries | `DimoRequestExecutor` owns HTTP retries; `S4_LOCAL_RETRY_LOOP_PRESENT=NO`; T07 owns cross-attempt retry |

**Not claimed:** production N≈1000 load certification (`productionLoadCertification=NOT_CLAIMED`).

## Cooldown priority policy

Lua acquire checks cooldown **before** priority — **all priorities blocked** while cooldown active (`COOLDOWN_PRIORITY_POLICY=ALL_PRIORITIES_BLOCKED`).

## Starvation promotion

`BACKGROUND` → `LOW` after `starvationPromotionMs` (`PB20`). S4 frozen context starts at `BACKGROUND` only.

## Tests

- Unit/mock: `dimo-provider-budget.service.spec.ts`, `dimo-provider-budget.config.spec.ts`, `dimo-request-executor.spec.ts`
- Real Redis multi-replica: `dimo-provider-budget.multi-replica.redis.integration.spec.ts` (`DIMO_PROVIDER_BUDGET_REDIS_INTEGRATION=1`)
- S4F certification unit: `di-v0-s4f-provider-backpressure-certification.unit.spec.ts` (`PB12`–`PB25`)

## Contract authority

`s4a-contract.v2.json` → `providerBackpressure.globalCircuitBreaker.status=CLOSED`, gap object `status=CLOSED`, evidence pointer to this document.

## Tiny activation

Gap closure **does not** imply `TINY_ACTIVATION_READY=YES` — still requires location governance note, explicit operator authorization, and `providerGlobalBudgetEnabled=ENABLED`.
