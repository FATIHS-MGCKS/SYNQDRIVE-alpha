# Battery V2 — REST Target Status History (RUNNING / SKIPPED)

**Gaps:** `BAT-V2-GAP-RUNNING-ORPHAN-001`, `BAT-V2-GAP-SKIPPED-REST-001`  
**Evidence:** `BAT-V2-EVID-GIT-RUNNING-SKIPPED-ENUM-001`, `BAT-V2-EVID-AUDIT-RUNNING-SKIPPED-WRITER-ABSENCE-001`

## Current-code facts (CONFIRMED)

| Fact | Status |
|------|--------|
| `RUNNING` is a current enum member | ✓ `lv-rest-window-target.metadata.ts` |
| `SKIPPED` is a current enum member | ✓ same |
| `isLvRestTargetAlreadyScheduled()` reads `RUNNING` as already-scheduled | ✓ lines 97–101 |
| Writer assigning `status: RUNNING` to REST target metadata | **Not found in audited scope** |
| Writer assigning `status: SKIPPED` | **Not found in audited scope** |
| SKIPPED lifecycle semantics defined | ✗ never implemented |

## Historical introduction (COMMIT_HISTORY)

| Field | Value |
|-------|-------|
| **Commit** | `6cbd9a9c0e019650a19b343081b55cf483f2788f` |
| **Date** | 2026-07-16 |
| **PR context** | Prompt 31/78 — REST_60M target job scheduling |
| **Change** | Added `LV_REST_TARGET_JOB_STATUS` including RUNNING and SKIPPED |

## Audit method (writer absence)

| Step | Method | Scope | Result |
|------|--------|-------|--------|
| 1 | `git log -S "LV_REST_TARGET_JOB_STATUS.RUNNING"` | `backend/**/lv-rest-window/**`, `backend/**/battery-health/**` | Introduction commit only |
| 2 | `git log -S "LV_REST_TARGET_JOB_STATUS.SKIPPED"` | same | Introduction commit only |
| 3 | `git log -G "RUNNING"` / `-G "SKIPPED"` | lv-rest-window paths | No assignment writers |
| 4 | `ripgrep status.*RUNNING\|SKIPPED` | `backend/**/battery-health/**` | Enum + reader only |

**Wording:** No writer found in audited repository/Git history. Exhaustive absence beyond audited scope **not proven**.

## Hypothesis (separate epistemic layer)

`BAT-V2-HYP-RUNNING-ORPHAN-001` (INFERRED): If RUNNING rows exist in production DB from unknown origin, they may need Bull liveness recovery. This is **not** a current-code fact.

## Non-effects

Phase 3 does not add writers, remove enum members, or access production DB.
