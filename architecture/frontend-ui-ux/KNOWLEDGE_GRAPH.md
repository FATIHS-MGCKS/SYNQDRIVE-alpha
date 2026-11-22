# Knowledge Graph Overview — Frontend UI/UX

## Epistemic legend

`CONFIRMED` · `INFERRED` · `HISTORICAL` · `UNKNOWN` · `CONTRADICTED`

## Core nodes (summary)

| ID | Type | Title |
|----|------|-------|
| FEUX-DOM-PLATFORM-001 | domain | Shared frontend UI platform |
| FEUX-DATA-THEME-001 | data | theme.css token layer |
| FEUX-DATA-PATTERNS-001 | data | Shared UI + patterns |
| FEUX-ORCH-ROUTES-001 | orchestrator | App.tsx router |
| FEUX-CONS-MASTER-001 | consumer | Master Admin UI |
| FEUX-CONS-RENTAL-001 | consumer | Rental UI |
| FEUX-CONS-OPERATOR-001 | consumer | Operator UI |
| FEUX-AUTH-I18N-BOUNDARY-001 | authority | i18n boundary |

## Decisions (register mirror)

| Decision ID | STATUS |
|-------------|--------|
| FEUX-DEC-PLATFORM-PROFILES-001 | VALIDATED |
| FEUX-DEC-SHARED-TOKEN-SSOT-001 | VALIDATED |
| FEUX-DEC-RENTAL-REFERENCE-001 | PROPOSED |
| FEUX-DEC-NO-I18N-DUP-001 | VALIDATED |

Machine-readable source: [`graph/nodes.yaml`](./graph/nodes.yaml), [`graph/edges.yaml`](./graph/edges.yaml), [`graph/invariants.yaml`](./graph/invariants.yaml).

## Flow (ASCII)

```
theme.css (tokens)
    ↑ consumed by
patterns/ui/shell
    ↑ consumed by
Master / Rental / Operator trees
    ↑ mounted by
App.tsx (BrowserRouter)
```

## Open gaps

See [`contradictions/KNOWLEDGE_GAPS.md`](./contradictions/KNOWLEDGE_GAPS.md).