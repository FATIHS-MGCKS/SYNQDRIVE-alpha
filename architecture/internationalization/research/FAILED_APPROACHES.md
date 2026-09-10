# Internationalization (i18n) — Failed Approaches

| ID | Approach | Notes |
|----|----------|-------|
| **I18N-FAIL-BRIDGE-001** | Maintain `frontend/src/rental/i18n/` compat bridge indefinitely | **Superseded** by Integration 2C — I18N-DEC-BRIDGE-RETIRE-001 |
| **I18N-FAIL-EN-SPREAD-001** | Use `...en` spread in locale dictionaries for false completeness | **Rejected** — structural test forbids; masks coverage gaps |
| **I18N-FAIL-FLAT-DOCS-001** | Treat flat `architecture/I18N_*` as canonical authority without registry | **Rejected** by MODULE_AUTHORITY_STANDARD — this bootstrap authority supersedes as routing layer |
| **I18N-FAIL-PERCENT-001** | Report single global i18n completion percentage | **Rejected** — denominators differ per workstream; use staged completion instead |
