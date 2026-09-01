# Bridge Fallback — Resolution Dossier (Phase 4)

**Gap:** `BAT-V2-GAP-BRIDGE-FALLBACK-001`  
**Priority:** P2  
**Readiness:** RESEARCH_REQUIRED

## CURRENT STATE

Bridge fallback: `lv-rest:{vehicleId}:{lastActivityAtMs}` when no trip in ±120s. Canonical: `lv-rest:{vehicleId}:{tripEndMs}`. **No auto-collapse** when trip later finalized.

## IMMUTABILITY CONSTRAINT

Do **not** assume existing `BatteryMeasurement` history may be safely rewritten ("rebind measurements"). Historical measurement→session association should be treated as **immutable** unless explicit supersession architecture is approved.

## OPTIONS

| Option | Summary | Migration | Verdict |
|--------|---------|-----------|---------|
| **A** Remove bridge | Breaking change | High | Reject without prod frequency |
| **B** Session supersession metadata | Mark fallback superseded; **no measurement mutation** | Medium | **RECOMMENDED investigate** |
| **C** Canonical alias / binding table | New association layer | Medium | **RECOMMENDED investigate** |
| **D** Dedupe by overlap at reconcile | Future duplicate suppression only | Medium | **RECOMMENDED paired with B/C** |
| **E** Accept duplicate risk | Status quo | None | **REJECT** for Stage 2+ |

## RECOMMENDED (PROPOSED)

**Option B + C + D:** When canonical arming runs, detect overlapping fallback session (same vehicle, anchor within 120s) → record supersession / alias metadata. **Do not backfill or rebind historical measurements.** Suppress duplicate **future** measurement creation where possible.

Requires session status / supersession enum extension research.

## RISKS

Race: bridge and trip finalize concurrent → test required

## NON-EFFECTS

No historical mutation/backfill implied. Gap remains open.

## GRAPH IDS

Gap remains open.
