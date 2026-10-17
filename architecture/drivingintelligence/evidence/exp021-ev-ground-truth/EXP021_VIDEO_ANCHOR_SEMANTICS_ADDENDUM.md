# EXP021 — video anchor semantics addendum

**Applies to:** frozen kompakt [`external-video-review-kompakt-2026-10-16/Bericht.md`](./external-video-review-kompakt-2026-10-16/Bericht.md) (file hash intentionally unchanged)  
**Supersedes for semantics only:** ambiguous “video t=0” / “Abfahrt am Anfang des Videos” readings where they imply a calibrated instant.

## Correct semantics

| Concept | Status |
|---------|--------|
| `2026-10-16T03:37:41Z` | **First visible on-screen clock label** in `TC_00062.MOV` (~1 Hz sample), not video presentation timestamp zero. |
| Owner reverse maneuver | **Qualitative departure context** at the beginning of the recorded clip — **CONFIRMED** owner statement. |
| First physical motion instant | **UNKNOWN** — not frame-calibrated; **not** proven at PTS=0. |

## Do not claim

- That the first clock label equals DIMO or FSM “start recognition”.
- That `lifecycleRecovery.startEpisode.candidateStartAt` (`03:38:26.989Z`) is physical departure or pure FSM delay without further evidence.

Machine-readable: [`VIDEO_ANCHOR_SEMANTICS_SUPPLEMENT_V1.json`](./forensic-readonly-exports-2026-10-16-supplement-v1/VIDEO_ANCHOR_SEMANTICS_SUPPLEMENT_V1.json)
