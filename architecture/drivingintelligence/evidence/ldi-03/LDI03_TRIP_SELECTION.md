# LDI03 — Trip selection

**HEAD:** `c1013265bc10af7ac5fe7e86ff372772373acd36` · **Mode:** read-only · **Org:** `faa710c9-6d91-4079-a7d5-91fdccdec14a`

## Active Ruptela R1 vehicles (frozen manifest cohort)

| Vehicle ID | Integration |
|------------|-------------|
| `19fedd4b-c4e8-4de8-a125-dab293326e7e` | RUPTELA_LTE_R1 |
| `c10351f8-b6a2-4258-947f-631aeaa6d359` | RUPTELA_LTE_R1 |
| `8c850ff1-4201-432b-af2e-2711dbc7ca48` | RUPTELA_LTE_R1 |

## Selected trip

- **Vehicle:** `19fedd4b-c4e8-4de8-a125-dab293326e7e`
- **Trip:** `f502a4a0-02d2-421d-bb39-7c9af25ba38e`
- **Work item:** `66fb6cdf-8682-4d3a-95a4-54d713a869fb`
- **Pinned snapshot:** `DI_V0_S4_EVIDENCE_V1:sha256:a4e05e8a49dcada6c1733143877fb948efdd08fc72c240516cc65323b597dd2b`
- **UTC window:** `2026-10-14T19:04:00Z` → `2026-10-14T19:22:10Z`

### Selection rationale

- positionPresentFraction=0.9963 (1086/1090)
- r1ObdNumericBuckets=109/1090
- nativeDrivingEvents=0
- positionGapRunsGte3s=1

Scored against all manifest Ruptela trips (position fraction, OBD numeric density, native `DrivingEvent` count, gap penalty).

### Candidate ranking

| Rank | Trip | Score | Native events |
|------|------|-------|---------------|
| 1 | `f502a4a0…` | 0.4333 | 0 |
| 2 | `08f2e58c…` | 0.2462 | 0 |
| 3 | `c65e7b49…` | 0.1223 | 0 |
| 4 | `24deb8af…` | 0.1030 | 0 |
| 5 | `be07d73f…` | 0.0277 | 0 |
| 6 | `3815920e…` | -0.0255 | 0 |
| 7 | `c26d3c13…` | -0.1190 | 0 |
| 8 | `533b2bf8…` | -0.9673 | 0 |

### Missing streams (if any)

- **Native DrivingEvents:** none persisted for trip — overlap table uses HF/L3 kinematics only
- **HF/OBD 1 Hz subset:** sparse vs shadow grid (see coverage report) — not a full-second HF lattice

## Repro

```bash
cd backend && npm run ldi03:ruptela-combined-pin
```

Requires read-only `DATABASE_URL` to org production/staging clone with pinned S4 snapshots.

**Production read-only export (2026-10-16):** `synqdrive-admin@srv1374778.hstgr.cloud`, `LDI03_REPO_ROOT=/opt/synqdrive/current`, output under `/tmp/ldi03-out-final` (artifacts copied into this directory for git).

### Integration identity

- **Family:** `RUPTELA_LTE_R1` (Tiguan LTE_R1 hardware path via DIMO)
- **S4 channels on pin:** `POSITION` + `R1_OBD` (HF subset 1 s, `INTERVAL_ONLY`); native channel not populated in persisted `DrivingEvent` rows for this UTC window