# Bridge Fallback — Resolution Dossier (Phase 4)

**Gap:** `BAT-V2-GAP-BRIDGE-FALLBACK-001`  
**Priority:** P2  
**Readiness:** RESEARCH_REQUIRED

## CURRENT STATE

Bridge fallback: `lv-rest:{vehicleId}:{lastActivityAtMs}` when no trip in ±120s. Canonical: `lv-rest:{vehicleId}:{tripEndMs}`. **No auto-collapse** when trip later finalized.

## OPTIONS

| Option | Summary | Migration | Verdict |
|--------|---------|-----------|---------|
| **A** Remove bridge | Breaking change | High | Reject without prod frequency |
| **B** Bind fallback on trip match | Supersede session | Medium | **RECOMMENDED investigate** |
| **C** Physical-rest-cycle identity | New abstraction | High | Future |
| **D** Dedupe by overlap | Reconcile merges | Medium | **RECOMMENDED paired with B** |
| **E** Accept duplicate risk | Status quo | None | **REJECT** for Stage 2+ |

## RECOMMENDED (PROPOSED)

**Option D + B:** When canonical arming runs, detect overlapping fallback session (same vehicle, anchor within 120s) → mark fallback `SUPERSEDED` / rebind measurements. Requires session status enum extension research.

## RISKS

Race: bridge and trip finalize concurrent → test required

## GRAPH IDS

Gap remains open.
