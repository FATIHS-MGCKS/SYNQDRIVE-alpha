# Driving Intelligence — PR Timeline (workstream window)

Rebuilt from DI-EV → PR mapping. **Unrelated** July 2026 DI V2 implementation PRs (P5–P64) excluded.

| PR | Merged | DI-EV | Type | Purpose | Deployed? |
|----|--------|-------|------|---------|-----------|
| #1452 | 2026-08-30 | 0001 | docs | Master reconstruction plan | Docs only |
| #1454 | 2026-08-30 | 0002 | docs | Phase 1 forensic audit | Docs only |
| #1456 | 2026-08-31 | 0003 | docs | Phase 2A query surface | Docs only |
| #1458 | 2026-08-31 | 0004 | docs | Phase 2B capability matrix | Docs only |
| #1459 | 2026-08-31 | 0005 | docs | Phase 2C schema expansion | Docs only |
| #1463 | 2026-08-31 | 0006 | docs | Phase 2D physics matrix | Docs only |
| #1465 | 2026-08-31 | 0007 | docs | Phase 2E redundancy | Docs only |
| #1466 | 2026-08-31 | 0008 | docs | Phase 2F acquisition strategy | Docs only |
| #1467 | 2026-08-31 | 0009/0010 | docs | LTE_R1 manifest freeze | Docs only |
| #1468 | 2026-08-31 | 0011/0012 | **runtime** | Flight Recorder foundation (3A.1 correction pass) | RC module on main |
| #1474 | 2026-08-31 | 0013/0014 | docs + canary | 3A.2 production preflight canary | Canary run |
| #1477 | 2026-09-01 | 0015 | docs | Evidence governance | Docs only |
| #1502 | 2026-09-02 | 0016–0019 | docs + evidence | RD001 capture report | Evidence |
| #1505 | 2026-09-02 | 0020 | **runtime** | FAST PRE-ARM/GO workflow (3A.3.1) | **Yes** |
| #1507 | 2026-09-02 | 0021 | **runtime** | HF watermark + AGGREGATE_BUCKET_V2 identity (3A.3.2) | **Yes** |
| #1509 | 2026-09-02 | 0022 | docs | Production cutover evidence (3A.3) | Deploy evidence |
| #1511 | 2026-09-02 | 0022 (amend) | docs | Canonical redeploy + post-deploy smoke | Docs only |
| #1512 | 2026-09-02 | 0023–0026 | docs + evidence | RD002 STOP audit | Production runtime evidence |
| #1514 | 2026-09-02 | 0027–0032 | docs + evidence | RD003 telemetry forensics | Production runtime evidence |
| #1516 | 2026-09-03 | 0033 | tooling | RD003 video-GT correlation export | Tooling |
| #1518 | 2026-09-03 | 0034A/B | tooling | Alignment workbench + sparse video GT | Tooling |
| #1520 | 2026-09-03 | 0034C/D | tooling | Global fingerprint discovery V2 | Tooling |
| #1523 | 2026-09-03 | 0034E | analysis | RD003 signal quality interpretation | Analysis |
| #1526 | 2026-09-03 | 0034F | design | Canonical V2 episode design export | Design only |
| #1529 | 2026-09-04 | 0035A.2 | docs + tooling | RD004-A Segment A semantics closeout | Evidence |
| #1532 | 2026-09-04 | 0035B.6.1 | tooling | RD004-B recovery policy semantic hygiene | Tooling fix |
| #1533 | 2026-09-05 | 0035C–C.1e | **runtime** | HF Recovery policy + block poll + C.1a–e | **CODE_DEPLOYED=YES**; HF V2 **OFF** |
| #1544 | — | authority | docs | `architecture/drivingintelligence/` (DRAFT) | Docs only |

**Merge commit PR #1533:** `3d5040b67abfdc7e95c1b507e13f45d1bc65af11`

**RELEVANT_MERGED_PR_COUNT:** **27** (excludes draft #1544)

**PR_TIMELINE_REBUILT_FROM_DI_EV_MAPPING = YES**

**Known previously omitted — now included:**
- KNOWN_MISSING_PR_1505_INCLUDED = **YES**
- KNOWN_MISSING_PR_1507_INCLUDED = **YES**
- KNOWN_MISSING_PR_1511_INCLUDED = **YES**
- KNOWN_MISSING_PR_1529_INCLUDED = **YES**

**Note:** Some DI-EV sub-revisions (0034B/C, 0035A/A.1, 0035B–B.5) share PRs with adjacent entries; no separate merge PR identified in registry.
