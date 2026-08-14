# CI-R3B.1 — Fresh replay proof evidence

**Phase:** CI-R3B.1 (implementation + fresh-database replay verification)  
**Authority terminal marker:** `CI_R3B021_FINAL_CONVERGENCE_COMPLETED` (verified present in ledger, executable contract, master audit)  
**PR:** [#1031](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1031) (`fix/ci-r3b-vehicle-trips-migration-replay-2026-08`)  
**Outcome:** `CI_R3B1_FRESH_REPLAY_PROOF_FAILED` — full head replay blocked by unrelated pre-existing migration-chain defect (`org_tasks` never created)

---

## 1. Repository baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b-vehicle-trips-migration-replay-2026-08` |
| `PRE_R3B1_SHA` | `d5fbe42780b7ce61c606ff6d1a4a5dbfa4bf7f94` (docs-only; last commit before R3B migration implementation) |
| Implementation commit | `bb44880b80b7ce61c606ff6d1a4a5dbfa4bf7f94` (`feat(migrations): add CI-R3B bootstrap, casing shims, and parity reconciliation`) |
| `POST_R3B1_SHA` | *(updated after evidence + bootstrap FK correction commit)* |
| Remote branch SHA (pre-push) | `bb44880b80b7ce61c606ff6d1a4a5dbfa4bf7f94` |
| PR #1031 HEAD (pre-push) | `bb44880b80b7ce61c606ff6d1a4a5dbfa4bf7f94` |
| Working tree at replay start | bootstrap FK syntax fix uncommitted (`ON DELETE SET` → `ON DELETE SET NULL`) |

Authority chain read before implementation:

- `docs/audits/ci-recovery/ci-r3b-executable-contract-2026-08.md` (§6 migration layout)
- `docs/audits/ci-recovery/ci-r3b-bootstrap-predecessor-shape-ledger-2026-08.md` (§4 predecessor, §5 convergence)
- `docs/audits/ci-recovery/ci-r3a8-u042-u043-decision-package-2026-08.md` (§3 shim guards)
- `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` (parity target)

---

## 2. Migration implementation

Four authorized append-only migrations implemented per executable contract §6:

| Slot | Path | Status |
|------|------|--------|
| Bootstrap (Option D) | `backend/prisma/migrations/20260325161141_ci_r3b_bootstrap_trip_schema_baseline/migration.sql` | **CREATED** |
| Pre-shim (Option J) | `backend/prisma/migrations/20260424235959_ci_r3b_trip_casing_pre_shim/migration.sql` | **CREATED** |
| Target (unchanged) | `backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql` | **UNCHANGED** |
| Post-shim (Option J) | `backend/prisma/migrations/20260425000001_ci_r3b_trip_casing_post_shim/migration.sql` | **CREATED** |
| Post-replay reconciliation | `backend/prisma/migrations/20260814130000_ci_r3b_post_replay_parity_reconciliation/migration.sql` | **CREATED** |

Post-implementation correction (authorized bootstrap scope only):

- Fixed invalid PostgreSQL FK actions `ON DELETE SET` → `ON DELETE SET NULL` on `driving_events.trip_id` and `trip_repairs.trip_id` foreign keys (syntax error blocked bootstrap on first replay attempt).

`R3B_PLANNED_NEW_MIGRATION_COUNT` = **4** (verified).

---

## 3. Immutable target migration

| Field | Value |
|-------|-------|
| Path | `backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql` |
| Authority SHA-256 | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |
| PRE-R3B1 SHA-256 | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |
| POST-R3B1 SHA-256 | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |

```bash
git diff d5fbe427 -- backend/prisma/migrations/20260425000000_retire_user_assignment_and_speeding_severity/migration.sql
# (no output — NO DIFF)
```

Historical migrations edited: **NO** (only four new R3B directories added; target byte-identical).

---

## 4. Fresh disposable PostgreSQL database

| Field | Value |
|-------|-------|
| Engine | PostgreSQL **16.14** (Ubuntu package, local disposable instance) |
| Database identifier | `synqdrive_r3b1_replay` |
| Connection host | `localhost:5432` (non-production) |
| Disposable DB confirmed | **YES** — `DROP DATABASE IF EXISTS` then `CREATE DATABASE` before replay |
| Initial SynqDrive schema empty | **YES** — only PostgreSQL system catalogs before `prisma migrate deploy` |
| Credentials in evidence | **NONE** (redacted) |

---

## 5. Full migration replay from zero

Command:

```bash
cd backend
export DATABASE_URL=postgresql://<user>:<redacted>@localhost:5432/synqdrive_r3b1_replay
npx prisma migrate deploy
```

Prisma reported **287 migrations** in repository.

| Metric | Value |
|--------|-------|
| Total migrations | **287** |
| Applied successfully | **14** |
| Failed | **1** |
| First failing migration | `20260412030000_platform_hardening_phase1` |
| Manual DB interventions | **0** |
| R3B pre-shim reached | **NO** (failure ~116 migrations before pre-shim slot) |
| R3B target reached | **NO** |
| R3B post-shim reached | **NO** |
| R3B reconciliation reached | **NO** |

Failure detail:

```
Migration name: 20260412030000_platform_hardening_phase1
Database error code: 42P01
ERROR: relation "org_tasks" does not exist
```

Root-cause classification: **E — unrelated existing repository problem**

Mechanical proof:

```bash
rg 'CREATE TABLE.*org_tasks' backend/prisma/migrations
# (no matches)
```

The first committed reference to `"org_tasks"` is `ALTER TABLE "org_tasks"` in `20260412030000_platform_hardening_phase1`. At least **12** later migrations also assume `org_tasks` exists. No committed migration creates the table. This defect predates the R3B repair window and is outside the authorized four-migration contract.

Partial replay successes relevant to R3B bootstrap:

- `20260325161141_ci_r3b_bootstrap_trip_schema_baseline` applied successfully (after FK syntax fix).
- `20260325161142_trip_architecture_refactor` applied successfully immediately after bootstrap.
- All nine bootstrap tables present in disposable DB after partial replay: `vehicle_trips`, `driving_events`, `trip_behavior_events`, `vehicle_trip_waypoints`, `vehicle_trip_tracking_runs`, `trip_repairs`, `trip_driving_impact`, `vehicle_trip_detection_states`, `brake_trip_metrics`.

---

## 6. Migration tracking integrity (partial replay state)

After failed deploy, `_prisma_migrations` contains:

- **14** rows with `finished_at` set (successful).
- **1** row for `20260412030000_platform_hardening_phase1` with `finished_at` NULL and failure log populated.
- No manual resolve/mark-applied operations performed.
- Four R3B migrations not yet reached; bootstrap appears exactly once with successful finish timestamp.

---

## 7. Authority convergence (final head — not reached)

Full catalog comparison against `ci-r3a7-production-catalog-evidence-2026-08.json` requires replay to current head including R3B reconciliation. Replay aborted before R3B shims/target/reconciliation and before ~273 remaining migrations.

| Check | Result |
|-------|--------|
| Authority rows 19/19 | **NOT VERIFIED** (replay incomplete) |
| Tables 9/9 | **NOT VERIFIED** |
| Enums 10/10 | **NOT VERIFIED** |
| Property categories 54/54 | **NOT VERIFIED** |
| Enum labelsets exact | **NOT VERIFIED** |

Mismatch counters (final canonical state):

| Counter | Value |
|---------|-------|
| default | N/A (replay incomplete) |
| type | N/A |
| nullability | N/A |
| constraint | N/A |
| index | N/A |
| enum | N/A |

State-A delta (`vehicle_trips.trip_status` default) reconciliation: **NOT APPLICABLE** — reconciliation migration never executed.

---

## 8. Relevant repository validation commands

| Command | Exit code | Notes |
|---------|-----------|-------|
| `npx prisma migrate deploy` (fresh DB) | **1** | P3018 at `20260412030000_platform_hardening_phase1` |
| `npm run prisma:validate` | **0** | Schema valid (existing warning on SetNull/required field) |
| `npm run prisma:generate` | **0** | Client generated v5.22.0 |
| `sha256sum` target migration | **0** | Matches authority hash |
| `git diff d5fbe427 -- target migration` | **0** | No diff |

---

## 9. Static implementation audit

Files changed since `PRE_R3B1_SHA` (`d5fbe427`):

| File | Classification |
|------|----------------|
| `backend/prisma/migrations/20260325161141_ci_r3b_bootstrap_trip_schema_baseline/migration.sql` | NEW R3B MIGRATION |
| `backend/prisma/migrations/20260424235959_ci_r3b_trip_casing_pre_shim/migration.sql` | NEW R3B MIGRATION |
| `backend/prisma/migrations/20260425000001_ci_r3b_trip_casing_post_shim/migration.sql` | NEW R3B MIGRATION |
| `backend/prisma/migrations/20260814130000_ci_r3b_post_replay_parity_reconciliation/migration.sql` | NEW R3B MIGRATION |
| `docs/audits/ci-recovery/ci-r3b1-fresh-replay-proof-2026-08.md` | R3B EVIDENCE/DOCUMENTATION |

`OTHER` (runtime/schema/unrelated): **0**

Prisma schema: **unchanged** (per authority).

---

## 10. Safety attestation

| Statement | Value |
|-----------|-------|
| Production database accessed | **NO** |
| Production data modified | **NO** |
| Historical migration modified | **NO** |
| Target migration modified | **NO** |
| Manual database repair performed | **NO** |
| Deployment performed | **NO** |
| Merge performed | **NO** |
| PR marked ready for review | **NO** |

---

## 11. Blocker summary

CI-R3B.1 implementation of the four authorized migrations is complete and the immutable target migration remains byte-identical. Fresh-database replay **cannot** reach current head because migration `20260412030000_platform_hardening_phase1` alters `"org_tasks"` but no earlier committed migration creates that table.

Repair of this defect is **outside** the accepted CI-R3B four-migration contract. Expanding R3B scope to add an `org_tasks` bootstrap or editing historical migrations would violate immutability and authority boundaries.

**Required next action (outside CI-R3B.1):** independent resolution of the missing `org_tasks` CREATE migration in the general migration chain, then re-run CI-R3B.1 replay proof.

---

## 12. Terminal status

**CI_R3B1_FRESH_REPLAY_PROOF_FAILED**

Technical blocker: `20260412030000_platform_hardening_phase1` — `relation "org_tasks" does not exist` (Category E pre-existing migration-chain defect).
