# R4 Deep Audit — External artifact index

Cloud-agent read-only audits @ Production **`a4d06c602ff192aa7ba6688a6472100033417bca`**.

These files live under `/opt/cursor/artifacts/` on the audit runner. Canonical defect IDs are in [../DEFECT_REGISTER.md](../DEFECT_REGISTER.md).

| Slice | Artifact | Register |
|-------|----------|----------|
| R4.1a Metrics / budget | `DIMO_R41A_PRODUCTION_METRICS_RESULT.md` | OBS-001, resilience DONE |
| R4.1b JWT 403 | `DIMO_R41B_ROOT_CAUSE_RESULT.md` | DEF-001..003 |
| R4.2 Telemetry | `DIMO_R42_TELEMETRY_QUALITY_AUDIT.md` | DEF-007..009, 008 |
| R4.3 Live UI | `DIMO_R43_LIVE_FRESHNESS_AUDIT.md` | DEF-004..006, 010–011 |

**R4.0** baseline: use `architecture/dimo-integration/evidence/PRODUCTION_BASELINE.md` + R9 evidence index entries.

**R4.1** provider query inventory: **not present** as committed doc → `DIM-OBS-002`.
