# EXP-021 S4F-7BA — One-shot Gate-6 infrastructure provisioning

**Date:** 2026-10-10 (UTC)  
**Scope:** `AUTHORIZED_SCOPE=INFRASTRUCTURE_ONLY` · `GATE6_LIVE_AUTHORIZATION=NO`  
**Pinned operator SHA (for P5 when resumed):** `445bacf5de4295ca277da2fb1cc163d3a6996190`  
**Observation:** read-only Phase A on Production; **no** Phase C–D mutations (Phase B stop).

## Phase A — Security preflight (PASS)

| Check | Expected | Observed |
|-------|----------|----------|
| Production SHA | `ab72f574014d6657cac158c253696b7237cdd3e6` | **MATCH** |
| Release | `20261009152645_v4994` | **MATCH** |
| Env SHA256 | `767686b9b022633284fa8b228cff2ccb6bed2c8d8dc21cae6022e36ff6bedbf0` | **MATCH** |
| Replica A health :3001 | 200 | **200** |
| Replica B health :3002 | 200 | **200** |
| Attestation fingerprint A/B | parity | **`2db4b520…cdcd88`** both replicas, state `OTHER` |
| GLOBAL kill | KILLED | **KILLED** |
| S4 persistence | zero | pipeline_versions **0**, work_items **0**, active N/A, evidence_snapshots **0**, shadow_runs **0**, shadow_intervals **0** |
| Five S4 flags | ON | MASTER/DISCOVERY/WORKER/POSITION/R1 **true** in `backend.env` |
| Pilot allowlist | present | `DI_V0_S4_VEHICLE_ALLOWLIST` + org allowlist **present** (values not logged) |
| APDS shadow | healthy | `synqdrive_apd_shadow_enabled 1` on both replicas |
| DIMO global budget | enabled | `synqdrive_dimo_global_budget_enabled 1` |
| Public health | ok | `https://app.synqdrive.eu/api/v1/health` **ok** |
| Existing Gate-6 shared | legacy only | `gate6-live-open-approval-root.key` **600** root; **no** Ed25519 public PEM or registers |
| `/opt/synqdrive/shared` | root 755 | **unchanged** |

No unexplained drift → Phase A **complete**.

## Phase B — Owner public key (STOP)

| Requirement | Result |
|-------------|--------|
| Owner `public.pem` on trusted device | **Not supplied** to this run (no workspace artifact, no approved env path, no pre-staged file on VPS) |
| Ed25519/SPKI verify + fingerprint | **Not performed** |
| Owner fingerprint cross-check | **Not performed** |

**Stop reason:** `OWNER_PUBLIC_KEY_REQUIRED` — private key was **not** generated on Production or in the Cloud Agent; **no** substitute public key was accepted.

## Phases C–E — Not executed

| Step | Status |
|------|--------|
| P1–P4 (shared trust files) | **SKIPPED** |
| P5 (detached operator @ `445bacf5…`) | **SKIPPED** (`NO_GATE6_OPERATOR_DIR` pre-check) |
| P6 (constrained sudoers) | **SKIPPED** (`NO_SUDOERS`) |
| Phase E verification | **SKIPPED** (nothing provisioned) |

## Resume checklist (next authorized run)

1. Deliver owner-generated **`public.pem`** (SPKI/Ed25519) + **documented SHA-256 fingerprint** for out-of-band verification.  
2. Re-run Phase A; confirm pins unchanged.  
3. Execute P1–P4 create-only (P1 target mode per S4F-7BA: **0600** root:root — compatible with trust anchor `≤640`).  
4. Clone detached operator to root-controlled path @ **`445bacf5…`**; reuse verified `node_modules` from current release **without** `npm install` on live release tree.  
5. Install `/etc/sudoers.d/synqdrive-gate6` with `visudo -c` + negative injection tests.  
6. Phase E read-only trust-anchor CLI checks only — still **no** approval, dispatch, dry-run, or live OPEN.
