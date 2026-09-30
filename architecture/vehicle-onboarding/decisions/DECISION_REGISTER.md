# Vehicle Onboarding — Decision Register (Bootstrap)

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| VO-DEC-0B-001 | VO-0B governance bootstrap and current-state seal | PROPOSED | VO-EVID-0B-001 |

---

## VO-DEC-0B-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | No registered Vehicle Onboarding / Vehicle Registry authority; VO-0A findings only in agent output |
| **WHY** | Governed workstream requires durable evidence before VO-1 architecture |
| **CHANGE** | Create `architecture/vehicle-onboarding/` bootstrap authority; registry row `AUDIT_IN_PROGRESS`; seal CURRENT_STATE at SHA `312d9f54a2b4c0b0740061d3e2b74897e78eacb0`; register VO-GAP-001…015 |
| **NON-EFFECTS** | No runtime, schema, API, billing, or provider behavior change |
| **EVIDENCE** | VO-EVID-0B-001 |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/vehicle-onboarding/scripts/validate-graph.sh` |
| **OPEN GAPS** | All VO-GAP-* STILL_OPEN; Production Phase 2 audit pending before `AUTHORITY_ACTIVE` |
