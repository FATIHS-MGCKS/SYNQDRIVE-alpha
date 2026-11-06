# DS4×RPM — M1 Ratio-State Profiler (P18A foundation)

Research-only offline harness for **RAY-RUN V1 foundation** and falsification controls.

- **Not** production, backend, or customer-facing.
- **P16 pin gate** must pass before any compute (`5774d38f…704e6` manifest self-hash).
- **B0/B1** histogram + block-5 baselines are immutable comparison references.
- **RAY-RUN V1** is implemented as an **offline P18B experiment** in `src/rayrun/` — not validated for any product use.

## P18B RAY-RUN experiment

Pipeline (Fable M1 design): I2 run-level rays → I1 origin-ray mixture with background (J by BIC on n_eff, cap 4, no J assumed) → I3 separability/merge (z=2, ≥3 runs, both clips) → I5 abstaining per-second state → I6 driving-context description.

- Thresholds and acceptance criteria are pre-registered in `src/rayrun/preregistration.ts` (committed before the evaluation code).
- Claims adopt ±500 rpm; ±250 is a sensitivity run only.
- Mandatory NC-E = `SCIENTIFIC_NEGATIVE`: regimes are `TRIP_POOLED_NOT_TEMPORALLY_REPLICATED` and tiers are capped at MEDIUM. No probabilities are emitted.
- If RAY-RUN does not outperform B0/B1 under the pre-registered rule, the report recommends the B0/B1 baselines.

```bash
npm run run:p18b
# default: /opt/cursor/artifacts/ds4-rpm-p18b-ray-run-experimental-report.json
```

## CI

GitHub Actions workflow for this package is **not** included in PR #2348: adding `.github/workflows/*` triggers `i18n-authority-protection` (`GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL`) until a trusted owner applies label `i18n-governance-authority-change`.

Local/PR verification:

```bash
cd research/driving-intelligence/ratio-state-profiler-m1
npm ci && npm run typecheck && npm test
```

## Emit evidence report

```bash
npm run run:p18a
# default: /opt/cursor/artifacts/ds4-rpm-p18a-ray-run-foundation-report.json
```

## Sealed inputs

| Role | Location |
|------|----------|
| P16 manifest | `fixtures/p16-ratio-state-evidence-pin-manifest.json` |
| P5 QC overlay | `fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv` |
| Video 1 Hz + windows + S4 R1 | `research/.../tiguan-20261022/` (repo-relative, hash-gated) |

P5 fixture mirrors the P16-pinned artifact when the Cursor artifacts path is unavailable (same SHA-256).
