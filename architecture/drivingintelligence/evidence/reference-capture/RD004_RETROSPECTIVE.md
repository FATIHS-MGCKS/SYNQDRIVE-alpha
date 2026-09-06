# RD004 — Complete Retrospective (Segment A + Segment B)

**Workstream window:** 2026-09-04  
**Vehicle:** KS MX 2024 (Mercedes C63) `a60c0749-…`  
**Session:** `f1e81e78-…` · DIMO token `187336` (example context only — not runtime canary authority per C.1b)  
**DI-EV chain:** 0035A → 0035A.2 (Segment A); 0035B → 0035B.6 (Segment B); feeds 0035C recovery

---

## Purpose

RD004 validated video↔telemetry alignment methodology under motion and discovered **late-arriving HF buckets** plus **capture watermark recovery gaps** that simple overlap cannot fix.

---

## RD004-A (Segment A) — video/telemetry alignment

| Iteration | DI-EV | Key finding | Status |
|-----------|-------|-------------|--------|
| A v1 | 0035A | Circular clock offset + drift defects | SUPERSEDED |
| A.1 | 0035A.1 | Corrected landmark/clock/drift/preprocessing | SUPERSEDED (semantics) |
| A.2 | 0035A.2 | H displacement ≠ provider offset; `CLOCK_FIT_ELIGIBLE=[]` | **CURRENT (Segment A)** |

### Measurements preserved (A.2)

- 38 HF speed samples in segment window (not collapsed to summary statistic)
- True local peak attenuation via independent maxima (not circular smoothing)
- Low MAE candidates **rejected** when violating hard temporal/physical bounds
- Alignment fit is **local segment evidence**, not global chronology proof

### Negative findings

- Global clock fit across full drive: **not established**
- Provider clock offset from video: **not inferable** from H displacement alone

**Evidence:** `docs/audits/data/rd004-segment-a/`, `architecture/RD004_A_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT_2026-09-04.md`

---

## RD004-B (Segment B) — whole-drive validation + HF recovery

| Stage | DI-EV | Finding |
|-------|-------|---------|
| B (original) | 0035B | Offset/MAE claims **invalidated** |
| B.3 | 0035B.3 | Launch gap 35.102s; +5s clock evidence removed; `CLOCK_FIT=0` |
| B.4 | 0035B.4 | **75 exact-window replays**; 53 late-arrival; 26 watermark-excluded |
| B.5 | 0035B.5 | Settlement×overlap grid; exact 8/6 claims **too strong** |
| B.6 | 0035B.6 | Provisional 8s settlement / 6s overlap; live calibration contract |

### Root cause (B.4, proven)

`PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP`

- Provider delivers buckets after initial query window closes
- Legacy 2s recovery overlap advances watermark past recoverable buckets
- **26 buckets permanently excluded** under overlap-only policy

### Sealed median spacing (~10.6s) — interpretation

| Claim | Supported? |
|-------|------------|
| RD004 sealed export shows ~10.6s median spacing | YES (capture completeness artifact) |
| DIMO physical ECU samples at 10.6s | **NO** |
| Same windows show 157 vs 104 buckets (exact replay) | YES — explains RD003 vs RD004 apparent disagreement |

See contradiction resolution: `DI-CONTRA-RD003-RD004-MEDIAN-001`

### Recovery policy evolution (B.5 → B.6 → 0035C)

| Parameter | Value | Authority |
|-----------|-------|-----------|
| Settlement delay | 8s (provisional) | RD004-B.6 + Recovery V2 code |
| Recovery overlap | 6s (provisional) | RD004-B.6 + Recovery V2 code |
| Triple watermarks | data / query / recovery | DI-EV-0035C implementation |
| Production post-trip HF | **unchanged** | DI-DEC-RC-SEPARATE-001 |

**Why simple last-seen timestamp failed:** query coverage advanced before provider settlement; late buckets arrived after watermark commit.

### Error metrics (video alignment segments, where applicable)

Preserved in segment exports — MAE/RMSE/max error reported per methodology revision. **Low error alone insufficient** — hard bounds rejection documented in A.2 and B chain.

---

## Follow-ups generated

1. DI-EV-0035C — HF Recovery V2 runtime (reference capture only)
2. DI-EV-0035C.1 — block polling scalability testbed
3. DI-EV-0035C.1a–e — pre-live-canary hardening
4. PR #1533 — code deployed, features disabled
5. **Pending:** operator-selected live 10/20/30/60 calibration

---

## Links

- [REFERENCE_DRIVES.md](./REFERENCE_DRIVES.md)
- [HF_RECOVERY_EVOLUTION.md](./HF_RECOVERY_EVOLUTION.md)
- [RD003_RETROSPECTIVE.md](./RD003_RETROSPECTIVE.md)
- `research/EXPERIMENT_REGISTER.md` — EXP-RD004-A, EXP-RD004-B
- `research/HYPOTHESIS_REGISTER.md` — DI-HYP-003, DI-HYP-004, DI-HYP-005
