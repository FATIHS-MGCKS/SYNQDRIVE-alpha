# No-Code Validation Paths (Phase 4)

Gaps materially reducible **without runtime changes**.

| Gap / Hypothesis | Method | Reduces uncertainty |
|------------------|--------|---------------------|
| `BAT-V2-HYP-POST-1445-SOAK-001` | Natural trip observation protocol | Liveness class |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | Read-only SQL: provenance distribution | Frequency |
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | Read-only: REST targets status=RUNNING | Orphan existence |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Query duplicate session keys per vehicle | Duplicate frequency |
| `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | Fleet count HYBRID + HV side-effect rows | Impact scope |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | Existing unit tests + truth table extension | Reachability (done) |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Log analysis: `redis-unavailable` token frequency | Risk quant |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | DIMO MCP capability audit | Signal availability |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Domain expert review of backlog | Classification only |

## Existing test suites (read-only run)

```bash
cd backend && npm test -- --testPathPattern=battery-v2
cd backend && npm test -- --testPathPattern=lv-rest-window
cd backend && npm test -- --testPathPattern=canonical-battery
bash architecture/battery-v2/scripts/validate-graph.sh
```

## Git history (already used Phase 3)

- `git log -S RUNNING` / `SKIPPED` for writer absence
- Publication enqueue absence audit

## Production access

This agent has **no authorized production DB access** in this run. Query plans are documented in dossiers; execution requires operator with read-only credentials.

## What still requires runtime implementation

- LV handoffs (PKG-01/02)
- Timestamp provenance schema (PKG-03)
- HV SOH iteration (PKG-04)
- HEV write-gate alignment (PKG-05, after decision)
