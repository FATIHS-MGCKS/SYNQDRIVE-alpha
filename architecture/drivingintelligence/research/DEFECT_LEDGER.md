# Driving Intelligence — Defect Ledger

Significant defects discovered during the 2026-08-30 → 2026-09-06 workstream.  
**Rejected hypotheses are NOT defects** — see `HYPOTHESIS_REGISTER.md`.

**Summary:** TOTAL=**19** | FIXED=**16** (DI-DEF-003–017, 019 production-validated) | OPEN=**3** (DI-DEF-001, 002, 018)

| ID | Phase | Symptom | Cause | Risk | Fix | Tests | Status |
|----|-------|---------|-------|------|-----|-------|--------|
| DI-DEF-001 | Phase 1 audit | `DriverScoreService` implies driver quality | Historical naming | UI/business misinterpretation | Semantic documentation only; rename deferred | — | OPEN |
| DI-DEF-002 | Phase 1 audit | `profilesComparable()` dead in rolling aggregate | Legacy code path | Incorrect rolling comparisons if invoked | Not fixed in DI scope | — | OPEN |
| DI-DEF-003 | RD001 | 39 HF buckets permanently excluded | Single watermark + late arrival | Incomplete HF capture | DI-EV-0021 per-field watermarks | 3A.3.2 tests | FIXED |
| DI-DEF-004 | RD003 alignment v1 | Clock-prior alignment false positives | Methodological defect in 0034C | Invalid GT claims | Superseded by 0034D V2 | Alignment tests | FIXED |
| DI-DEF-005 | RD003 alignment v1 | Static-minute geometry error | Incorrect joint interval geometry (D.1) | Wrong basin selection | DI-EV-0034D.2 correction | V2 discovery tests | FIXED |
| DI-DEF-006 | RD004-A v1 | Circular clock offset + drift | Methodology | Invalid speed alignment | 0035A.1 → 0035A.2 closeout | Segment A tests | FIXED |
| DI-DEF-007 | RD004-B B.5 | 8s/50-50 overlap "protection" overclaimed | Lower-bound semantics error | False confidence in parameters | DI-EV-0035B.6 correction | B.6.1 hygiene tests | FIXED |
| DI-DEF-008 | C.1a audit | Canary fail-open when allowlist empty | Missing fail-closed gate | Unscoped V2 activation | Empty allowlist → LEGACY | C.1a policy tests | FIXED |
| DI-DEF-009 | C.1a audit | Bucket-age semantic error | Wrong age computation for observability | Misleading metrics | Semantic correction | Block poll tests | FIXED |
| DI-DEF-010 | C.1a audit | Stagger deadline primitive missing | Fleet stagger design incomplete | Duplicate poll storms | Deadline primitive added | C.1a tests | FIXED |
| DI-DEF-011 | C.1d audit | Lost-update race on phase switch | Cycle release overwrote calibration state | Wrong poll cadence during live test | FOR UPDATE + boundary activation | 12 concurrency tests | FIXED |
| DI-DEF-012 | C.1d audit | V2 activation gate missing on phase API | Authority verification gap | Phase API without V2 | Fail-closed gate | Calibration tests | FIXED |
| DI-DEF-013 | C.1e audit | Stale precompute race on phase request | Phase computed from pre-lock snapshot | Operator phase reverted | `requestHfCalibrationPhaseAtomic()` | C.1e lifecycle tests | FIXED |
| DI-DEF-014 | C.1e audit | Terminal phase not finalized on stop | Missing finalization path | Lost phase evidence | `finalizeTerminalCalibrationSeries()` | Stop quiescence tests | FIXED |
| DI-DEF-015 | C.1e audit | Synthetic temporal bucket identity | Request count used as time identity | Wrong cadence statistics | Real ISO bucket-start timestamps | Temporal metric tests | FIXED |
| DI-DEF-016 | C.1e audit | Transition windows contaminated primary stats | Inclusion in cadence comparison | Invalid 10/20/30/60 comparison | Exclude TRANSITION + RECOVERY_SWEEP | Phase summary tests | FIXED |
| DI-DEF-017 | C.1e CI | Constructor dependency mismatch | Test-only DI wiring | CI failure | Test-only fix in PR #1533 | 113 RC HF tests | FIXED |
| DI-DEF-018 | Production detectors | ~1 Hz assumption in HF window producer | Code predates RD003/RD002 cadence evidence | Detector timing on sparse HF | **Not fixed** — documented as semantic debt | — | OPEN |
| DI-DEF-019 | Live cal 2026-09-06 | `switchHfCalibrationPhase` fails in production | `lockSessionRow` raw SQL used Prisma model table `"ReferenceCaptureSession"` + camelCase columns; Prisma maps IDs to PostgreSQL `text` (no `::uuid` cast) | **Live HF calibration blocked**; stop/abort finalization also affected | Fix `reference_capture_sessions` + `organization_id`; GATE 1 PG integration + GATE 2 production dress rehearsal | `reference-capture-lock-session.postgres.integration` (10 tests) + gate script; GATE 2 STOP/ABORT on prod | FIXED_PRODUCTION_VALIDATED |
