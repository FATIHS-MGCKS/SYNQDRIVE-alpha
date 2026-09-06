# Production Deployment State (post PR #1533)

**Merge commit:** `3d5040b67abfdc7e95c1b507e13f45d1bc65af11`  
**Merge date:** 2026-09-05  
**PR:** #1533

---

## Mandatory terminology

| Term | Value | Meaning |
|------|-------|---------|
| CODE_DEPLOYED | **YES** | C.1a–e + Recovery V2 code on `main` / production VPS |
| FEATURE_ENABLED | **NO** | `HF_RECOVERY_POLICY_V2_ENABLED=false`; V2 canary gates off |
| LIVE_CANARY_EXECUTED | **NO** | Zero active V2 canaries; zero calibration sessions run post-deploy |
| HF_30S_BLOCK_POLLING_VALIDATED | **NO** | No live 10/20/30/60 phase evidence |
| Production HF authority | **LEGACY** | `trip-behavior-enrichment` whole-trip `fetchHighFrequency` |

**Inaccuracy to avoid:** "HF Recovery V2 not deployed" — code **is** deployed; features **disabled**.

---

## Flag inventory (reference capture)

| Flag / config | Default post-deploy |
|---------------|---------------------|
| `REFERENCE_CAPTURE_ENABLED` | false (typical prod) |
| `HF_RECOVERY_POLICY_V2_ENABLED` | false |
| HF recovery canary allowlist | empty → LEGACY fail-closed |
| `HF_HISTORICAL_POLL_INTERVAL_MS` | 30000 (provisional; inactive without V2) |
| `HF_SETTLEMENT_DELAY_MS` | 8000 (provisional) |
| `HF_RECOVERY_OVERLAP_MS` | 6000 (provisional) |

---

## Production DI path (unchanged)

```
VehicleTrip COMPLETED
  → trip.behavior.enrichment (LEGACY)
  → fetchHighFrequency (whole trip, no Recovery V2)
  → detectors (point-pair, ~1Hz assumption)
  → trip.driving-impact.compute
```

---

## Infrastructure readiness

| Capability | State |
|------------|-------|
| Recovery V2 policy code | On production binary |
| Block polling policy code | On production binary |
| Multi-cadence calibration API | On production binary |
| Operator runbook for live calibration | **INCOMPLETE** (`DI-OQ-PROD-002`) |
| Evidence from live run | **NONE** |

---

## Transition timeline

1. PR #1533 merged → code on main
2. VPS deploy (standard release pipeline) → binary includes RC hardening
3. Flags remain OFF → zero behavior change on production HF
4. **Next scientific step:** operator-selected Flight Recorder calibration drive

---

## Links

- `research/PR_TIMELINE.md`
- `evidence/reference-capture/HF_RECOVERY_EVOLUTION.md`
- `decisions/DECISION_REGISTER.md` — DI-DEC-DEPLOY-DISABLED-001
- `CURRENT_STATE.md`
