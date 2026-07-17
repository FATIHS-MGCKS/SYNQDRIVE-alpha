# Driving Intelligence V2 — Shadow Canary (F.S Mobility Service)

**Status:** ACTIVE (Shadow Canary)  
**T0:** 2026-07-17 (UTC)  
**T+7 Review:** 2026-07-24 (shared with Battery REST Shadow)  
**T+28 Minimum Gate Review:** 2026-08-14  

---

## Scope

| Field | Value |
|-------|-------|
| **Organization** | F.S Mobility Service |
| **Org ID** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **Vehicles (5)** | `c10351f8-b6a2-4258-947f-631aeaa6d359`, `19fedd4b-c4e8-4de8-a125-dab293326e7e`, `8c850ff1-4201-432b-af2e-2711dbc7ca48`, `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, `c43c3b45-b911-498f-baf9-4376dd585588` |
| **Parallel canary** | Battery REST Shadow — same org, same T+7/T+28 calendar |

### Flags (VPS `/opt/synqdrive/shared/backend.env`)

| Flag | Value | Notes |
|------|-------|-------|
| `DRIVING_INTELLIGENCE_V2_ENABLED` | `true` | **ON** — master gate for post-trip V2 shadow framework |
| `DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED` | `true` | Engine shadow detectors |
| `DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED` | `true` | HF shadow detectors |
| `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED` | `false` | Stay OFF until separate review |
| `customerDrivingDecisionEnabled` | (not implemented) | Must stay OFF |

**Scope note:** Flags are global. Canary org is the only fleet with regular trip + telemetry activity for validation today.

---

## What changes at T0

With `DRIVING_INTELLIGENCE_V2_ENABLED=true`:

1. `ShadowDetectorOrchestratorService` runs after each **COMPLETED** trip init (`DrivingAnalysisInitService`)
2. Active detectors: cold engine load, sustained high load, kickdown-like, high RPM stationary, excessive idling, EV power demand (+ brake_intensity stub)
3. Results persist as **shadow** `driving_evidence` — **no** automatic customer block, **no** Misuse CONFIRMED from shadow alone
4. Trip FSM / live detection **unchanged** (hard invariant)

**Already running without master flag:** `TRIP_ENRICHMENT` analysis runs with `maturity=SHADOW`. T0 primarily enables **shadow detector framework** on completed trips.

---

## Post-start smoke (T0 + trips)

Requires at least **one completed trip** after restart.

```bash
# 1) Health
curl -sS https://app.synqdrive.eu/api/v1/health

# 2) Flags on VPS
grep -E '^DRIVING_' /opt/synqdrive/shared/backend.env

# 3) Shadow evidence (read-only SQL on prod)
# Expect rows after first post-T0 trip finalize for canary org vehicles
```

```sql
-- Shadow evidence last 24h (canary org)
SELECT COUNT(*) AS shadow_evidence_24h
FROM driving_evidence de
JOIN driving_analysis_runs r ON r.id = de.analysis_run_id
WHERE r.organization_id = 'faa710c9-6d91-4079-a7d5-91fdccdec14a'
  AND de.metadata_json::text ILIKE '%shadow%'
  AND r.started_at > NOW() - INTERVAL '24 hours';

-- Framework skip metric should drop (Grafana)
-- synqdrive_shadow_detector_framework_skipped_total{reason="flags_disabled"}
```

**Safety checks (must pass):**

- No new rental blocks attributable to driving shadow on canary fleet
- `rental_driving_analyses.payload.patternSummary.automaticBlockingEnabled === false` where present
- No `driving_decision_audits` auto-created (P73 not live)

---

## T+7 review checklist (2026-07-24)

Run **together** with Battery REST Shadow T+7 (`battery-rest-shadow-canary-faa710c9.md`).

- [ ] ≥ 1 completed trip per active canary vehicle since T0 (or documented why not)
- [ ] `driving_evidence` with shadow metadata for canary org (`observation-days=7` window)
- [ ] `driving_analysis_runs` with `analysisType=TRIP_ENRICHMENT` — no mass FAILED
- [ ] `driving_intelligence_jobs` — completed rate > 95 %; DLQ not growing
- [ ] Manual FP sample: **10 trips** — shadow candidates plausible, no mass false positives
- [ ] Rental health: **no** new driving-related hard blocks on canary
- [ ] Prometheus: `synqdrive_shadow_detector_framework_skipped_total{reason="flags_disabled"}` ≈ 0 after T0
- [ ] Grafana `synqdrive-driving-intelligence-v2` — funnel not stuck

### Decision at T+7

| Outcome | Action |
|---------|--------|
| Shadow detectors firing, no safety regression | **Continue shadow** until T+28 |
| Zero shadow evidence despite trips | RCA: capability, HF mirror, trip init — keep flag ON only if jobs healthy |
| Eligibility / rental blocks | **Rollback** master flag immediately |
| High FP rate on manual sample | Document RCA; keep shadow ON but no promotion |

---

## T+28 gate review (2026-08-14)

Per `driving-intelligence-v2-shadow-validation.md` §8:

- 28 days observation on canary fleet
- Shadow FP rate documented
- No open P0 in `driving-intelligence-v2-final-audit.md` for target dimension
- TripDecisionSummary UI + Legal for customer decision **before** any promotion beyond shadow

**No auto-publish. No customer blocking flags.**

---

## Rollback

```bash
# On VPS — edit /opt/synqdrive/shared/backend.env
DRIVING_INTELLIGENCE_V2_ENABLED=false
pm2 restart synqdrive --update-env
```

Shadow evidence and analysis runs **retained**.

---

## References

- Shadow validation: `docs/runbooks/driving-intelligence-v2-shadow-validation.md`
- Rollout flags: `docs/architecture/driving-intelligence-v2-rollout-flags.md`
- Architecture: `docs/architecture/driving-intelligence-v2.md` §5 (Shadow definition)
- Battery parallel canary: `docs/runbooks/battery-rest-shadow-canary-faa710c9.md` (branch/ops artifact)
