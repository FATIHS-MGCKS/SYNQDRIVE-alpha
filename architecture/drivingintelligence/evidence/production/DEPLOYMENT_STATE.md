# Production Deployment State (post PR #1533)

**Merge commit:** `3d5040b67abfdc7e95c1b507e13f45d1bc65af11`  
**Merge date:** 2026-09-05  
**PR:** #1533

---

## Mandatory terminology

| Term | Value | Meaning |
|------|-------|---------|
| CODE_DEPLOYED | **YES** | C.1a–e + HF Recovery **policy code** on `main` / production VPS |
| REFERENCE_CAPTURE_INFRASTRUCTURE_ENABLED | **YES** | `REFERENCE_CAPTURE_ENABLED=true` on production (since 3A.2 canary era) |
| HF_RECOVERY_V2_FEATURE_ENABLED | **NO** | `HF_RECOVERY_POLICY_V2_ENABLED=false` |
| HF_RECOVERY_SWEEP_ENABLED | **NO** | Sweep feature off |
| HF_CALIBRATION_ENABLED | **NO** | `HF_AVAILABILITY_CALIBRATION_ENABLED=false` |
| ACTIVE_HF_V2_CANARIES | **0** | Empty canary allowlist → LEGACY fail-closed |
| ACTIVE_CALIBRATION_SESSIONS | **0** | No post-#1533 calibration runs |
| LIVE_CANARY_EXECUTED | **NO** | No live 10/20/30/60 phase evidence |
| HF_30S_BLOCK_POLLING_VALIDATED | **NO** | Hypothesis not tested live |
| PRODUCTION_HF_AUTHORITY | **LEGACY** | `trip-behavior-enrichment` whole-trip `fetchHighFrequency` |

**Inaccuracy to avoid:** Saying "all experimental gates OFF" — Reference Capture **infrastructure is enabled**; HF Recovery V2 **feature flags** are disabled.

**Inaccuracy to avoid:** "HF Recovery V2 not deployed" — policy **code is deployed**; **feature is disabled**.

---

## Flag inventory (reference capture)

| Flag / config | Production state (post #1533 evidence) |
|---------------|----------------------------------------|
| `REFERENCE_CAPTURE_ENABLED` | **true** (infrastructure active) |
| `HF_RECOVERY_POLICY_V2_ENABLED` | **false** |
| `HF_RECOVERY_SWEEP_ENABLED` | **false** |
| `HF_AVAILABILITY_CALIBRATION_ENABLED` | **false** |
| HF recovery canary allowlist | **empty** → LEGACY fail-closed |
| `HF_HISTORICAL_POLL_INTERVAL_MS` | 30000 (provisional; inactive without V2 feature) |

---

## Production DI path (unchanged)

```
VehicleTrip COMPLETED
  → trip.behavior.enrichment (LEGACY)
  → fetchHighFrequency (whole trip, no Recovery V2 policy active)
  → detectors (point-pair, ~1Hz assumption)
  → trip.driving-impact.compute
```

---

## Links

- `research/PR_TIMELINE.md`
- `evidence/reference-capture/HF_RECOVERY_EVOLUTION.md`
- `decisions/DECISION_REGISTER.md` — DI-DEC-DEPLOY-DISABLED-001
- `CURRENT_STATE.md`
