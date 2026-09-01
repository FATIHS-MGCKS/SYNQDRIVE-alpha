# Battery V2 — REST Target Status History (Phase 3)

**Gaps:** `BAT-V2-GAP-RUNNING-ORPHAN-001`, `BAT-V2-GAP-SKIPPED-REST-001`  
**Epistemic:** CONFIRMED from git history + current code

## Enum introduction

| Commit | Date | Change |
|--------|------|--------|
| `6cbd9a9c` | 2026-07-16 | `LV_REST_TARGET_JOB_STATUS` created with `RUNNING` and `SKIPPED` |

## Git history verdict

`git log -S "LV_REST_TARGET_JOB_STATUS.RUNNING"` and `-S "SKIPPED"` under `battery-health/**` return **only** the enum-creation commit.

**No writer ever assigned `RUNNING` or `SKIPPED` in git history.**

## Status values actually written (current)

| Status | Writer |
|--------|--------|
| `SCHEDULED` / `ENQUEUED` | `battery-v2-rest-target.producer.ts` |
| `COMPLETED` / `CANCELLED` / `MISSED` / `FAILED` | `battery-rest-target-evaluate.handler.ts` |
| `PENDING_EVALUATION` | handler + reconciliation |

## Read-only references to RUNNING

`isLvRestTargetAlreadyScheduled` treats `RUNNING` as non-reschedulable — **defensive guard** for hypothetical/orphan metadata.

## Hypothesis update

`BAT-V2-HYP-RUNNING-ORPHAN-001` — refined: enum reserved at inception; **no historical writer found**. Orphan `RUNNING` rows in production DB — **UNKNOWN** (no DB access). If present, likely manual/migration artifact not from current code.

## SKIPPED

Enum-only. **Unused design debt** — no current semantics.

## Classification

| ID | Refined status |
|----|----------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | HISTORICAL enum debt + defensive read guard |
| `BAT-V2-GAP-SKIPPED-REST-001` | HISTORICAL unused enum debt |

## Non-effects

Phase 3 does not add writers or remove enum values.
