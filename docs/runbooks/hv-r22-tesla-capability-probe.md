# HV R22 — Tesla capability probe (owner-gated)

## Purpose

One-shot evidence that DIMO exposes usable `powertrainTractionBatteryChargingAddedEnergy` **1m** interval buckets (`LAST` / `MIN` / `MAX`) for Tesla token **186946**. This is **not** R22 capture activation and **does not** persist sidecar rows.

## Existing evidence (offline)

- Fixture: `backend/src/modules/vehicle-intelligence/battery-health/hv-h4/fixtures/r15-dimo-added-energy-interval.v1.fixture.json`
- Episode `oct12_session_3e5fe028` — query window inside a documented Tesla HV recharge session
- Evaluator: `hv-charging-counter-evidence.capability-eval.v1.ts` (distinguishes query success vs numeric signal vs plausibility)

## Offline evaluation (no provider call)

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/hv-r22-tesla-capability-probe.ts --mode=fixture
```

## Live probe (owner authorization required)

** Preconditions**

- Owner explicitly approves **one** GraphQL `signals` query for a **small** window inside a known closed charge session
- Set `HV_R22_CAPABILITY_PROBE_OWNER_AUTHORIZED=1` only for that run
- No automatic retries; script aborts if window > 4h

**Suggested pilot window (13 minutes, Oct 12 session start)**

- `from=2026-10-12T13:06:55Z`
- `to=2026-10-12T13:20:00Z`
- Estimated cost: **1** GraphQL query, ~14 returned 1m buckets (upper bound)

```bash
cd backend
HV_R22_CAPABILITY_PROBE_OWNER_AUTHORIZED=1 \
npx ts-node -r tsconfig-paths/register scripts/ops/hv-r22-tesla-capability-probe.ts \
  --mode=live --from=2026-10-12T13:06:55Z --to=2026-10-12T13:20:00Z
```

## Interpretation

| Outcome | Meaning |
|---------|---------|
| `QUERY_SUCCESS_SIGNAL_UNAVAILABLE` | HTTP/GraphQL succeeded but no usable numeric `LAST` energy counters |
| `QUERY_SUCCESS_SIGNAL_PRESENT_NOT_PLAUSIBLE` | Numeric values present but gaps/negatives/insufficient trend |
| `QUERY_SUCCESS_SIGNAL_PLAUSIBLE` | Numeric counters with non-negative LAST trend (still not production capture) |

Do **not** enable `BATTERY_V2_HV_CHARGING_COUNTER_BUCKET_CAPTURE_ENABLED` from this probe alone.
