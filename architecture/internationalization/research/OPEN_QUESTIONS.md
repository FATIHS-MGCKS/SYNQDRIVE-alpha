# Internationalization (i18n) — Open Questions

| ID | Question | Priority | Status |
|----|----------|----------|--------|
| **I18N-OQ-001** | What is the authoritative completion criterion for "Rental i18n rebuild finished"? | High | **OPEN** — report by workstream stage, not percentage |
| **I18N-OQ-002** | When should `tr.ts` receive owned dictionary content vs remain fallback-only? | Medium | **OPEN** — product decision |
| **I18N-OQ-003** | Should Master admin use same enforce-clean phases as Rental or separate phase map? | Medium | **OPEN** |
| **I18N-OQ-004** | Is ICU/pluralization required for any current product surfaces? | Low | **INFERRED NO** — no ICU engine in platform runtime (code inspection) |
| **I18N-OQ-005** | Restore `hardcoded-copy-guard.test.ts` or remove reference from `i18n-check.mjs`? | Medium | **OPEN** — I18N-GAP-004 |
