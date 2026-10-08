# EXP-021 S4F-7AF.1A — Production deployment freeze coordination & evidence

**Date (UTC):** 2026-10-08  
**Mode:** Read-only — no Production mutation, deploy, restart, migration, DB write, JIT mint, `DRY_RUN=0`, or live config staging.  
**Context:** S4F-7AF.1 stopped with `TERMINAL_OUTCOME=FAILED_BEFORE_MUTATION` because `DEPLOY_FREEZE_CONFIRMED=NO`. This slice maps deploy entrypoints, freeze authority, and Production concurrency — **without** inventing locks or reusing S4F-7Y live approval as freeze proof.

---

## 1. Deployment entrypoints (code vs Production)

| Class | Mechanism | Triggers Production mutation? |
|-------|-----------|-------------------------------|
| **Code merge** | GitHub merge to `main` | **NO** — no GHA workflow deploys to Hostinger VPS |
| **Production deploy** | `bash .cursor/scripts/cloud-agent-deploy.sh` → SSH → `SYNQDRIVE_REQUESTED_DEPLOY_SHA` + `backend/scripts/ops/vps-deploy-release.sh` | **YES** — clone release, `prisma:migrate:deploy`, PM2 rolling restart, symlink `/opt/synqdrive/current` |
| **Bootstrap deploy** | Same `vps-deploy-release.sh` fetched at exact SHA (DEC-016; see S4F-7C evidence) | **YES** (full release path) |
| **Migration** | Bundled inside `vps-deploy-release.sh` (`npm run prisma:migrate:deploy`) | **YES** on deploy only — no standalone migrate operator found on Production |
| **Backend restart** | `vps_replica_rolling_deploy` / `pm2 restart` inside deploy; manual PM2 on VPS | **YES** if invoked |
| **EXP021 live tiny staging (config-only)** | `backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh` (and sealed S4F-7Y wrapper) | **YES** for shared `backend.env` + metrics attestation — **not executed** in this slice |
| **EXP021 / APDS operators** | Fleet deploy guard (`vps-exp021-fleet-deploy-guard.lib.sh`) runs **during** deploy; APDS activation is engineering on `main`, not auto-applied to current Production bytes | Deploy guard: **on deploy**; APDS: **latent until next full deploy** |
| **GitHub Actions** | CI only (`*-production-readiness`, `exp021-autonomous-orchestrator-ci`, postgres integration, governance) — `workflow_dispatch` for tests, **no** `vps-deploy` job | **NO** |
| **Hostinger** | VPS hosting; release process is SynqDrive ops scripts above | **NO** direct auto-deploy from panel observed |

**Distinction:** `main` @ `bca309f617cc1f41beb3665143ff8a711b0b4951` is **10 commits ahead** of running Production (`54fc704f…`), including APDS Prisma (#1920) — **deploy/migration dependency on next full deploy**, not concurrent with current Production SHA.

---

## 2. Deployment authority & existing freeze mechanisms

| Topic | Finding |
|-------|---------|
| **Who may deploy** | Human operator with VPS SSH credentials (`synqdrive-admin` on Hostinger path A per `AGENTS.md`) and explicit `SYNQDRIVE_REQUESTED_DEPLOY_SHA` / `CLOUD_AGENT_REQUESTED_DEPLOY_SHA`; Cursor Cloud Agent may invoke `cloud-agent-deploy.sh` when user authorizes **commit and deploy** |
| **Technical guards (not freeze)** | DEC-016 exact-SHA provenance; optional `SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE` + deploy-controller SHA pin (S4F-7R); `vps-exp021-fleet-deploy-guard.lib.sh` capability check at deploy time |
| **Operational freeze marker** | **NONE** — read-only VPS probe 2026-10-08: `/opt/synqdrive/shared/DEPLOY_FREEZE`, `.deploy_freeze`, `deploy_freeze*` **absent**; no in-repo deploy-freeze env contract located |
| **Maintenance gate** | Documented for destructive SQL/Redis restore ops — **not** a standing Production deploy freeze |
| **S4F-7Y human live approval** | Recorded for **single config staging attempt** — **does not** satisfy §2 deploy-freeze gate (explicitly excluded by task) |

**`HUMAN_COORDINATION_CONFIRMED`:** **NO** — no separate, scoped deploy-freeze attestation from deployment authority in this run.

**Required confirmation (not received):** Repository **Production deploy authority** (org operator who controls VPS deploy — typically the human who would run or authorize `cloud-agent-deploy.sh` / manual `vps-deploy-release.sh`) must issue an **explicit** freeze for the S4F-7AF live-staging window, covering:

- full VPS release deploy (`vps-deploy-release.sh` + Prisma migrate + PM2),
- any parallel EXP021/APDS operator deploy or config path,
- documented start/end and scope.

Agent **must not** create freeze files, disable CI, or mint technical locks without separate approval.

---

## 3. Active Production operations (read-only)

| Check | Result |
|-------|--------|
| Host | `srv1374778` |
| `CURRENT` release | `20261008001031_v4994` |
| `CURRENT_PRODUCTION_SHA` | `54fc704fb50c285c68470d8fa274d72a67438482` (**matches** expected baseline — **no drift**) |
| PM2 | `synqdrive` PID `1872240`, `synqdrive-b` PID `1872498`, **online** |
| Health | `https://app.synqdrive.eu/api/v1/health` → **200** |
| Running deploy/migrate processes | **NONE** (`vps-deploy`, `prisma migrate`, `cloud-agent-deploy`) |
| Active non-idle PG workload (excl. probe) | **0 rows** |
| Last deploy capture | `last-deploy-state.env` → previous `a376c965…` @ `20261007151232_v4994`, captured `2026-10-08T00:22:38Z` |
| GitHub Actions | No in-progress **deploy** workflow; routine CI on `main` (e.g. Trip FSM readiness in progress) — **not** Production VPS deploy |

---

## 4. Freeze verdict

Absence of running deploys **is insufficient**. No operative freeze mechanism is active; no deployment-authority freeze confirmation was provided for this slice.

| Criterion | Met? |
|-----------|------|
| Authority confirmed freeze | **NO** |
| Scope covers EXP021 + APDS + Prisma + PM2 paths | **N/A** (not declared) |
| No colliding Production actions | **YES** (observed) |
| Start/end/scope/authority documented | **NO** |
| Sustain through live attempt | **NOT ESTABLISHED** |

---

## 5. Handoff (single-attempt coordination only)

After **`DEPLOY_FREEZE_CONFIRMED=YES`** from deployment authority (out-of-band record acceptable; **not** invented here):

1. Re-authorize **one** S4F-7AF.1 execution (new explicit human gate — prior S4F-7Y approval **not** reused for freeze).
2. Fresh Production preflight on **current** Production SHA (re-verify if freeze window is long).
3. Mint fresh JIT + `AUTHORIZED_*` at execution boundary only; `DRY_RUN=1` then single `DRY_RUN=0` via sealed tool path — **separate slice**, not this document.

**No new JIT authority in AF.1A.**

---

## Machine block

```
EXP021_S4F7AF1A_DEPLOY_FREEZE_RESULT=COMPLETE_READ_ONLY

CURRENT_MAIN_SHA=bca309f617cc1f41beb3665143ff8a711b0b4951
CURRENT_PRODUCTION_SHA=54fc704fb50c285c68470d8fa274d72a67438482
MAIN_AHEAD_OF_PRODUCTION_COMMITS=10
PRODUCTION_DRIFT_VS_BASELINE=NONE

DEPLOYMENT_ENTRYPOINTS_IDENTIFIED=GITHUB_MAIN_MERGE_NO_AUTO_DEPLOY;CURSOR_CLOUD_AGENT_DEPLOY_SH;VPS_VPS_DEPLOY_RELEASE_SH;DEC016_EXACT_SHA_BOOTSTRAP;PRISMA_MIGRATE_DEPLOY_ON_RELEASE;PM2_ROLLING_RESTART_ON_RELEASE;EXP021_DI_V0_S4_STAGE_TINY_FRESH_PRODUCTION_SH_CONFIG_ONLY;EXP021_FLEET_DEPLOY_GUARD_ON_RELEASE;GITHUB_ACTIONS_CI_ONLY_NO_VPS_DEPLOY
DEPLOYMENT_AUTHORITY_IDENTIFIED=HUMAN_VPS_OPERATOR_WITH_SSH_AND_EXPLICIT_REQUESTED_DEPLOY_SHA;CURSOR_CLOUD_AGENT_WHEN_USER_AUTHORIZES_CLOUD_AGENT_DEPLOY_SH
EXISTING_FREEZE_MECHANISM=NONE_OPERATIONAL_NO_SHARED_MARKER_NO_REPO_DEPLOY_FREEZE_CONTRACT
HUMAN_COORDINATION_CONFIRMED=NO

ACTIVE_DEPLOYMENTS=NONE_OBSERVED
PENDING_PRODUCTION_DEPLOYMENTS=NONE_OBSERVED
ACTIVE_MIGRATIONS=NONE_OBSERVED
ACTIVE_BACKEND_RESTARTS=NONE_OBSERVED
CONCURRENT_OPERATOR_CONFLICTS=NONE_OBSERVED

DEPLOY_FREEZE_CONFIRMED=NO
DEPLOY_FREEZE_SCOPE=UNSET
DEPLOY_FREEZE_START=UNSET
DEPLOY_FREEZE_END=UNSET
DEPLOY_FREEZE_AUTHORITY=UNCONFIRMED_REQUIRES_PRODUCTION_DEPLOY_OPERATOR_EXPLICIT_FREEZE_DECLARATION
DEPLOY_FREEZE_EVIDENCE=NEGATIVE_PROBE_VPS_SHARED_FREEZE_FILES_ABSENT;NO_HUMAN_FREEZE_ATTESTATION_IN_RUN;S4F7Y_LIVE_APPROVAL_NOT_VALID_AS_FREEZE

PRODUCTION_MUTATION_OCCURRED=NO
DRY_RUN0_EXECUTED=NO
GATE_6=NOT_SATISFIED

BLOCKERS=DEPLOY_FREEZE_NOT_CONFIRMED_BY_DEPLOYMENT_AUTHORITY;EXPLICIT_DEPLOY_FREEZE_COORDINATION_REQUIRED;RE_AUTHORIZE_S4F7AF1_AFTER_FREEZE;FRESH_PRODUCTION_PREFLIGHT_AT_EXECUTION;FRESH_JIT_AND_AUTHORIZED_PINS_AT_EXECUTION_ONLY
NEXT_SAFE_ACTION=PRODUCTION_DEPLOY_OPERATOR_ISSUES_EXPLICIT_SCOPED_DEPLOY_FREEZE_FOR_LIVE_STAGING_WINDOW_THEN_RE_RUN_S4F7AF1_WITH_NEW_SINGLE_ATTEMPT_APPROVAL
FINAL_RESULT=BLOCKED
```
