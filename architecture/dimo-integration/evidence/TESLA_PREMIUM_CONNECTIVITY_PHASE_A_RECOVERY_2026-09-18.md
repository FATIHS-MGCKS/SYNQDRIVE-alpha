# Tesla Premium Connectivity — Phase A recovery after EXP-021 isolation failure

| Field | Value |
|-------|-------|
| **Evidence ID** | DIM-EV-TESLA-PREMIUM-PHASE-A-RECOVERY-001 |
| **Prior evidence** | [TESLA_PREMIUM_CONNECTIVITY_PHASE_A_2026-09-18.md](TESLA_PREMIUM_CONNECTIVITY_PHASE_A_2026-09-18.md) (start gate **FAIL**) |
| **Recovery executed (UTC)** | `2026-09-18T16:57:45.000Z` (authoritative Phase-A T0) |
| **Production SHA** | `ca7bad8826871376a58efaa874f12992b88c4a04` (unchanged) |

## 0. Failed candidate T0 (invalid)

| Key | Value |
|-----|-------|
| FAILED_TESLA_PHASE_A_T0 | `2026-09-18T11:17:34.000Z` |
| FAILED_TESLA_PHASE_A_T0_VALID | **NO** |
| Reason | `TESLA_PHASE_A_START_GATE=FAIL` because `EXP021_OPERATOR_RUNNING=YES` |

Observations between the failed candidate T0 and recovery remain in DB/logs as historical evidence only. They are **not** counted toward the official 7-day Phase A window.

## 1. Tesla identity and P2.5 (reverified)

| Key | Value |
|-----|-------|
| TESLA_VEHICLE_UUID | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| TESLA_DIMO_TOKEN_ID | `186946` |
| TESLA_INTEGRATION | `DIMO_TESLA_INTEGRATION` |
| TESLA_EXTERNAL_HARDWARE_PRESENT | NO |
| TESLA_PREMIUM_CONNECTIVITY | OFF (`OPERATOR_GROUND_TRUTH`) |
| P25_T0 | `2026-09-18T09:33:25.000Z` (unchanged) |
| P25_EPOCH_RUNNING | YES |

## 2. EXP-021 operator origin (before stop)

| Key | Value |
|-----|-------|
| EXP021_OPERATOR_PID | `3566610` (tmux server); Nest enroll child `3566638` (exited `2026-09-18T14:59:54Z`) |
| EXP021_TMUX_SESSION | `exp021-ks-mx-2024-operator` |
| EXP021_PROCESS_START_TIME | `2026-09-18T10:58:21Z` |
| EXP021_COMMAND_LINE | `tmux new-session -d -s exp021-ks-mx-2024-operator` → `npm run exp021:maturation-shadow:canary:enroll -- --token-id 187336 --wait-next-window --execute` |
| EXP021_PARENT_PROCESS | `systemd` (PID 1) after detached tmux |
| EXP021_LAUNCH_ORIGIN | **AUTOMATION** — SSH publickey for `synqdrive-admin` from Cursor Cloud Agent egress IP at **exact** session start (`sshd` accept `2026-09-18T10:58:21Z`); detached root tmux wrapper documented in operator log `/opt/synqdrive/shared/exp021-ks-mx-2024-operator-2026-09-18T105821Z.log` |
| EXP021_AUTO_RESTART_CONFIGURED | **NO** — no `cron`, `systemd`, or PM2 unit for EXP-021 operator (verified) |
| EXP021_AUTO_ENROLLMENT_CONFIGURED | **YES** (runtime flags) — `EXP021_MATURATION_SHADOW_ENABLED=true`, `EXP021_FLEET_COORDINATOR_ENABLED=true`, allowlist `187336` in `backend.env`; **NO** detached operator auto-launcher (no cron/systemd/PM2 for the tmux CLI) |

Enroll CLI outcome while running: **timeout** waiting for next KS MX 2024 authoritative window (`OPERATOR_EXIT_CODE=0`, no enrollment JSON). Scientific maturation-shadow rows for tokenId `187336` at recovery: **0** families / **0** windows / **0** slots / **0** attempts (prior DB rows, if any, preserved).

## 3. EXP-021 stop

| Action | Result |
|--------|--------|
| Graceful mechanism | Enroll Nest context exited on wait timeout (`app.close()` in CLI `finally`); residual `tmux` + `sleep 86400` wrapper cleared (session ended ~`16:55` UTC per `last`) |
| PM2 / env / queues | **Not** modified |
| EXP021_OPERATOR_RUNNING (post-stop) | **NO** (`pgrep` empty after observation window) |

## 4. Auto-restart proof

| Key | Value |
|-----|-------|
| EXP021_OPERATOR_REAPPEARED | **NO** |
| EXP021_AUTO_RESTART_OBSERVED | **NO** |

Observation: ≥45s after stop + recovery checks; no new `exp021` / `maturation-shadow` processes.

## 5. Tesla interference audit (`2026-09-18T10:58:21Z` → enroll exit `14:59:54Z`)

| Question | Answer | Basis |
|----------|--------|--------|
| EXP021_AND_TESLA_SHARE_DIMO_PROVIDER | **YES** | Same org DIMO credentials / telemetry API for all fleet tokens |
| EXP021_AND_TESLA_SHARE_POLL_QUEUE | **YES** (while CLI Nest context lived) | Enroll bootstrap uses full `AppModule` + `WorkersModule`; operator log shows `DimoSnapshotProcessor` activity in CLI process (parallel to PM2 workers) |
| EXP021_AND_TESLA_SHARE_GLOBAL_CONCURRENCY | **YES** | Shared Redis/BullMQ and DIMO HTTP capacity |
| EXP021_CAN_AFFECT_TESLA_POLL_TIMING | **YES** (during overlap) | Extra Bull consumers + DIMO calls from CLI context |
| EXP021_CAN_AFFECT_TESLA_PROVIDER_RATE_LIMIT | **YES** | Org-level DIMO API limits |
| EXP021_CAN_AFFECT_TESLA_SOURCE_TIMESTAMP | **NO** | EXP-021 targets tokenId `187336` maturation shadow; no enrollment path writes Tesla `186946` `source_timestamp` |
| TESLA_FAILED_START_WINDOW_CONFOUNDED | **YES** | Shared provider/queue pressure during failed-start window; **failed T0 remains invalid regardless** |

## 6. Controlled variables

| Check | Status |
|-------|--------|
| SNAPSHOT_INTERVAL | 30s |
| SNAPSHOT_CONCURRENCY | 8 |
| ACTIVITY_TIER_POLLING | ON |
| LIVEMAP_INTERVAL | 5s |
| LIVEMAP_CONCURRENCY | 10 |
| DIMO_ENDPOINTS_UNCHANGED | YES |
| TESLA_PROVIDER_CONFIGURATION_UNCHANGED | YES |
| TESLA_PREMIUM_CONNECTIVITY | OFF |
| CONTROLLED_VARIABLES_STILL_VALID | **YES** |

## 7. Freshness measurement contract

| Key | Value |
|-----|-------|
| TRUE_FRESHNESS_AUTHORITY | `vehicle_latest_states.source_timestamp` |
| SOURCE_TIMESTAMP_MEASUREMENT_READY | YES |
| SNAPSHOT_MEASUREMENT_READY | YES (`dimo_poll_logs` + HV/CH witnesses) |
| SIGNALS_LATEST_MEASUREMENT_READY | YES (VLS + per-signal timestamps) |

## 8. Authoritative Phase-A T0 (new)

| Key | Value |
|-----|-------|
| TESLA_PHASE_A_T0 | `2026-09-18T16:57:45.000Z` |
| TESLA_PHASE_A_END | `2026-09-25T16:57:45.000Z` |

## 9. Zero baseline at new T0

| Key | Value |
|-----|-------|
| TESLA_SOURCE_TIMESTAMP_AT_T0 | `2026-09-15T21:08:19.787Z` |
| TESLA_VLS_UPDATED_AT_AT_T0 | `2026-09-18T16:46:53.788Z` |
| TESLA_TELEMETRY_AGE_AT_T0 | ~244165 s (~67.8 h) |
| TESLA_ACTIVITY_STATE_AT_T0 | `ASLEEP_OR_OFFLINE_STALE` |
| PHASE_A_POLL_COUNT_AT_T0 | 0 |
| PHASE_A_UNIQUE_SOURCE_ADVANCES_AT_T0 | 0 |
| PHASE_A_STALE_RESPONSE_COUNT_AT_T0 | 0 |

Tool: `backend/scripts/ops/tesla-phase-a-zero-baseline-readonly.cjs` with `TESLA_PHASE_A_T0` env.

## 10. P2.5 isolation

| Key | Value |
|-----|-------|
| P25_T0_UNCHANGED | YES (`2026-09-18T09:33:25.000Z`) |
| P25_EPOCH_RUNNING | YES |
| P25_SHADOW_STATE_UNCHANGED | YES |
| PRODUCTION_DEPLOYED | NO |

## 11. Recovery start gate

**TESLA_PHASE_A_RECOVERY_START_GATE=PASS**
