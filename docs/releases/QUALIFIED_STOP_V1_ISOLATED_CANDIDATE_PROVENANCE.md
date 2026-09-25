# Qualified Stop V1 — isolated production release candidate (validation only)

| Field | Value |
|-------|--------|
| **Base (Production)** | `2b0ef15fc80069676cd44f1b852a362434f7ffb7` |
| **Source PR #1750 merge** | `3067fad1aad509c29b2c83a6f3f0b16135da7a63` (semantic net diff only) |
| **Source PR #1753 merge** | `b0a7cd08942e94cf0ff5010b417d4b2beabedca6` (semantic net diff only) |
| **Strategy** | Net diff from Production base → trip FSM + `worker.config.ts` paths only |
| **Unrelated main commits included** | **NO** (no Battery/ERD/migrations/frontend master UI) |
| **Deploy** | **NOT authorized by this document** — exact-head CI validation only |

---

## Historical note (2026-09-25 authority rebaseline)

| Field | Value |
|-------|-------|
| **Isolated validation candidate commit** | `9f3462303db3ac4360334e0c9fcadffdb4959350` |
| **DEPLOY_REQUIRED** | **NO** — historical isolated CI candidate only; **not** the Production release target |
| **Accidental main merge** | PR **#1757** @ `301e4a32f278694a679b4a7dd4e4e41f9a5ce467` — squash merge changed **only** R8 orchestration test harness files + this provenance doc (**NO_RUNTIME_DELTA_INTRODUCED**) |
| **Production Qualified Stop V1** | Delivered via normal release line @ `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` (`20260924235024_v4994`) including #1750 + #1753 — see [TDL-EVID-QS-V1-PROD-ACCEPT-001](../../architecture/trip-detection-lifecycle/evidence/QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md) |

Agents must **not** treat `9f346230…` or PR #1757 as a pending Production deploy requirement.
