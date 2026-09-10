# Internationalization (i18n) — Open Contradictions

| ID | Contradiction | Status |
|----|---------------|--------|
| **I18N-CX-001** | `.cursor/rules/i18n.mdc` documents `frontend/src/rental/i18n/` bridge; Integration 2C removed it from code | **OPEN** — code is authoritative; rule doc stale (I18N-GAP-007) |
| **I18N-CX-002** | `ArchitekturView.tsx` entries reference `frontend/rental/i18n/translations/` for notifications | **OPEN** — historical architecture view copy; platform path is `frontend/src/i18n/translations/` |
| **I18N-CX-003** | Module absent from central registry despite extensive flat `architecture/I18N_*` and campaign docs | **RESOLVED in this workstream** — registry row added `AUDIT_IN_PROGRESS`; flat docs remain supporting evidence only |

## Resolution policy

Contradictions are recorded explicitly. Code + verified tests win over stale docs. Supporting campaign/flat documents do not override this authority once promoted.
