# M3.1 — Direct full-fleet Battery V2 production activation

**Date:** 2026-09-03  
**Activation timestamp (`BATTERY_V2_FULL_FLEET_T0`):** `2026-09-03T11:08:02Z`  
**Deployed runtime SHA:** `0e0f09259f206aef44bd66eb4c142f7aee3fe29c` (PR #1519)  
**Main SHA (includes #1522 docs):** `f5669f6833685c849c54b969679d93746c67ad23`  
**Release path:** `/opt/synqdrive/releases/20260903101734_v4994`  
**Config backup:** `/opt/synqdrive/shared/backend.env.bak-battery-v2-m31-20260903110709`

## Product decision

Full connected production fleet activation — **no canary, no staged rollout, no vehicle subset.**

## Pre-cutover config (authoritative `backend.env`)

| Flag | Value |
|------|-------|
| `BATTERY_V2_PUBLICATION_ENABLED` | `false` |
| `BATTERY_V2_REST_SHADOW_ENABLED` | `true` |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` (code default) |
| `BATTERY_V2_RECONCILIATION_INTERVAL_MS` | `300000` |
| `BATTERY_V2_RECONCILIATION_BATCH` | `25` |
| `BATTERY_V2_OBSERVATION_STALE_MS` | `120000` |
| `BATTERY_V2_DLQ_REPLAY_ENABLED` | `false` |

## Post-cutover effective config

| Flag | Value | Source |
|------|-------|--------|
| `BATTERY_V2_PUBLICATION_ENABLED` | **`true`** | `/opt/synqdrive/shared/backend.env` + PM2 |
| `BATTERY_V2_REST_SHADOW_ENABLED` | **`false`** | `/opt/synqdrive/shared/backend.env` + PM2 |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` | code default |

Rolling multi-replica restart completed with scheduler convergence gate (1 leader).

## ACTIVATION_T0 baseline (pre-cutover, 11:07 UTC)

| Metric | Value |
|--------|-------|
| BullMQ wait/active | 0 / 0 |
| BullMQ failed | 77 |
| BullMQ completed | 1000 |
| Reservations | 0 |
| PKG-01 ENQUEUED / EXECUTED / MISSING | 24 / 24 / 13 |
| PKG-02 EXECUTED / MISSING | 10 / 5 |
| `battery_publications` (all time) | **0** |
| Post-M3.0E failed delta | 0 |

## 30-minute post-activation observation

| Checkpoint | Time (UTC) | failed | post-activation failed | reservations | publications since T0 |
|------------|------------|--------|----------------------|--------------|----------------------|
| T+2 | 11:10 | 77 | 0 | 0 | 0 |
| T+5 | 11:13 | 77 | 0 | 0 | 0 |
| T+15 | 11:23 | 77 | 0 | 0 | 0 |
| T+30 | 11:38 | 77 | 0 | 0 | 0 |

**PM2:** both replicas online throughout; restart count stable (+1 per replica from cutover only).  
**Scheduler:** exactly 1 leader (`synqdrive` LEADER after cutover).  
**Health:** `ok` at all checkpoints.

### New failure delta (since `BATTERY_V2_FULL_FLEET_T0`)

All monitored classes: **0** (54000, index row size, uuid cast, LOCK_CONTENTION, AUTHORITY_UNAVAILABLE, reservation errors, HANDLER_FAILED, publication persistence).

### Duplicate identity checks

`dup_assess=0`, `dup_pub=0`, `dup_customer_pub=0` at all checkpoints.

## Connected fleet evidence (6 vehicles)

| Vehicle | Plate | Latest measurement | Latest assessment | Pubs since T0 | Pub handoff | Status |
|---------|-------|-------------------|-------------------|---------------|-------------|--------|
| a60c0749… | KS MX 2024 | 11:05:55 (pre-T0) | 11:05:55 | 0 | EXECUTED* | **NO NEW DATA SINCE T0** |
| 19fedd4b… | WOB L 750 | 11:00:25 (pre-T0) | 11:00:55 | 0 | EXECUTED* | **NO NEW DATA SINCE T0** |
| c10351f8… | KS MS 661 | 09:41:19 (pre-T0) | 10:30:55 | 0 | EXECUTED* | **NO NEW DATA SINCE T0** |
| 8c850ff1… | HMÜ C 215 | 2026-09-02 | — | 0 | — | Idle / no recent REST |
| c43c3b45… | WOB L 9755 | 2026-08-27 | — | 0 | — | Idle |
| 68868291… | KS FH 660E (EV) | — | — | 0 | — | No LV REST path |

\*Pre-activation shadow-era handoffs marked `EXECUTED` in assessment metadata with **zero** `battery_publications` rows (publication gate was OFF). Expected; first customer-facing publications require **new eligible evidence** post-T0.

**Aggregates since T0:** measurements=0, assessments=0, publications=0.

This is **not a pipeline failure** — last fleet measurements occurred 2–8 minutes before activation; canonical 30m/6h REST timing has not yet produced new post-cutover evidence within the 30-minute window.

## 30-minute verdict

```
BATTERY_V2_30M_PRODUCTION_STATUS = PASS_WITH_PENDING_NATURAL_EVIDENCE
```

Infrastructure and activation path are healthy. Customer-facing `battery_publications` persistence awaits natural post-T0 REST/assessment cycles (6-hour follow-up required).

## Rollback status

**Not performed.** No rollback triggers met.

## 6-hour follow-up

Execute on VPS (≥6h after `BATTERY_V2_FULL_FLEET_T0`):

```bash
sudo BATTERY_V2_FULL_FLEET_T0=2026-09-03T11:08:02Z \
  bash /opt/synqdrive/current/backend/scripts/ops/battery-v2-m3-1-six-hour-validation.sh
```

(Script committed in this PR; until merged/deployed, pipe via SSH stdin from repo.)

## Ops scripts added

| Script | Purpose |
|--------|---------|
| `battery-v2-m3-1-production-snapshot.sh` | Read-only activation observability |
| `vps-enable-battery-v2-full-fleet-production.sh` | Authoritative config cutover + rolling restart |
| `battery-v2-m3-1-six-hour-validation.sh` | ≥6h read-only validation checklist |

## Remaining uncertainties

1. First `battery_publications` row creation not yet observed (expected until next eligible REST window).
2. Pre-T0 `EXECUTED` publication handoffs without persisted publications will not re-enter PKG-02 reconciliation queue — new assessments drive first customer-facing publications.
3. 3-vehicle PKG-01 backlog (24 ENQUEUED) continues converging independently of publication activation.

## Explicit flags

```
BATTERY_V2_FULL_FLEET_ACTIVE = YES
BATTERY_V2_PUBLICATION_ENABLED = TRUE
BATTERY_V2_REST_SHADOW_ENABLED = FALSE
BATTERY_V2_30M_PRODUCTION_VALIDATED = PENDING_NATURAL_EVIDENCE
PRODUCTION_VALIDATED = NO
SIX_HOUR_VALIDATION_PENDING = YES
```

## Amendment (2026-09-03 cutover contract audit)

**Historical record preserved above.** Subsequent audit (`M3_1_CUTOVER_CONTRACT_AUDIT.md`) determined:

| Field | Original 30m interpretation | Corrected interpretation |
|-------|----------------------------|--------------------------|
| `INFRASTRUCTURE_HEALTH` | PASS | PASS (unchanged) |
| `M3_1_ACTIVATION_CONTRACT` | Implicitly healthy | **MISMATCH** — `REST_SHADOW=false` disables canonical REST |
| `CANONICAL_REST_PIPELINE_ACTIVE` | Assumed pending rest windows | **NO** — config-blocked |
| `M3_1_STATUS` | `PASS_WITH_PENDING_NATURAL_EVIDENCE` | **`BLOCKED_BY_CUTOVER_CONTRACT`** |
| `PRODUCTION_VALIDATED` | `NO` / pending natural evidence | **`PENDING_CORRECTED_ACTIVATION_EVIDENCE`** |

The activation script (`vps-enable-battery-v2-full-fleet-production.sh`) set `REST_SHADOW=false` intending to exit shadow-only mode, but Stage-2 cutover per code requires `REST_SHADOW=true` + `PUBLICATION=true` (shadow semantics off via `isLvRestShadowModeActive=false`, canonical pipeline ON). Waiting for natural REST evidence under the deployed flag combination would not produce canonical REST measurements.
