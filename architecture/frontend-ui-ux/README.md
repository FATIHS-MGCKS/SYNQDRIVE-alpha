# Shared UI Design Foundation — Living Architecture Authority

| Field | Value |
|-------|-------|
| **Registry module name** | Shared UI Design Foundation |
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority-native status** | Bootstrap V1 + owner refinement V2 (2026-11-22, PR #2490) · Production UI **NOT_STARTED** |
| **Maturity** | Shared tokens/patterns **SUBSTANTIAL** · cross-product governance **VALIDATED** · runtime isolation **INCOMPLETE** (shared CSS/components) |

## What this module owns

Canonical architectural memory for **shared visual foundation only**:

- Design language, tokens, surfaces L0–L4 ([`design-system/SHARED_DESIGN_SYSTEM.md`](./design-system/SHARED_DESIGN_SYSTEM.md))
- Canonical references: `frontend/src/styles/theme.css`, style contracts, `components/ui`, `components/patterns`, shared shell primitives
- Typography, color, motion, accessibility **baselines**
- Cross-product dependency inventory ([`inventories/SHARED_COMPONENTS.md`](./inventories/SHARED_COMPONENTS.md))
- Cross-product change policy ([`governance/CROSS_PRODUCT_CHANGE_POLICY.md`](./governance/CROSS_PRODUCT_CHANGE_POLICY.md))
- Rental↔Master comparison matrix **PROPOSED** ([`governance/RENTAL_MASTER_COMPARISON.md`](./governance/RENTAL_MASTER_COMPARISON.md))

## Explicit non-scope

| Product | Authority path |
|---------|----------------|
| Master Admin UI/UX | [`products/master-admin/`](./products/master-admin/) |
| Rental UI/UX | [`products/rental/`](./products/rental/) |
| Operator UI/UX | [`products/operator/`](./products/operator/) |

Product-specific navigation, shells, screen inventories, findings, and change ledgers live in **those** authorities — not here.

## Mandatory entry documents

See registry detailed section: README, AUDIT_MANIFEST, CURRENT_STATE, AGENT_CONTRACT, KNOWLEDGE_GRAPH, decisions, evidence, graph, contradictions, research, validators.

## Critical boundaries

| Boundary | Owner |
|----------|--------|
| i18n locale/copy | [`architecture/internationalization/`](../internationalization/) |
| Product UX contracts | Master / Rental / Operator UI/UX authorities |
| Figma / visual implementation | Out of scope unless separately tasked |

## Owner decision traceability

| Decision | Status |
|----------|--------|
| `FEUX-DEC-PLATFORM-PROFILES-001` (single authority + profiles) | **SUPERSEDED** → independent product authorities |
| `FEUX-DEC-INDEPENDENT-AUTHORITIES-002` | **VALIDATED** |
| `FEUX-DEC-CHANGE-ISOLATION-001` | **VALIDATED** |

## Validation

```bash
bash architecture/frontend-ui-ux/scripts/validate-graph.sh
bash architecture/frontend-ui-ux/products/master-admin/scripts/validate-graph.sh
bash architecture/frontend-ui-ux/products/rental/scripts/validate-graph.sh
bash architecture/frontend-ui-ux/products/operator/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Last updated

2026-11-22 — Independent product authority split (PR #2490 remediation).