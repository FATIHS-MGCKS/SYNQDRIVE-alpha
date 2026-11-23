# Legacy UI/UX Document Inventory

**Scan date:** 2026-11-23 (Europe/Berlin)  
**Operation:** SYNQDRIVE_FEUX_CANONICAL_UI_UX_AUTHORITY_AND_AGENT_ENFORCEMENT  
**Evidence:** FEUX-EVID-AGENT-ROUTING-2026-11-23

## Disposition legend

| Class | Agent behavior |
|-------|----------------|
| `CANONICAL_AUTHORITY` | Mandatory read for scoped work |
| `CANONICAL_IMPLEMENTATION_CONTRACT` | Code/style SSOT; indexed by foundation |
| `PRODUCT_SPECIFIC_AUTHORITY` | Product subtree under `frontend-ui-ux/products/` |
| `SUPPORTING_EVIDENCE` | Historical audit input; not routing |
| `HISTORICAL_SUPERSEDED` | Do not treat as current; see successor |
| `DUPLICATE_OBSOLETE` | Superseded duplicate; git history preserved |
| `CONFLICTING_INSTRUCTION` | Remediated in `.cursor/rules` / `AGENTS.md` (2026-11-23) |
| `UNRESOLVED_REVIEW_REQUIRED` | Ambiguous; classify before delete |

## Canonical authorities (active)

| Path | Class | Successor / notes |
|------|-------|-------------------|
| `architecture/frontend-ui-ux/` | CANONICAL_AUTHORITY | Shared UI Design Foundation |
| `architecture/frontend-ui-ux/products/master-admin/` | PRODUCT_SPECIFIC_AUTHORITY | Master Admin UI/UX |
| `architecture/frontend-ui-ux/products/rental/` | PRODUCT_SPECIFIC_AUTHORITY | Rental UI/UX |
| `architecture/frontend-ui-ux/products/operator/` | PRODUCT_SPECIFIC_AUTHORITY | Operator UI/UX |
| `architecture/frontend-ui-ux/design-system/SHARED_DESIGN_SYSTEM.md` | CANONICAL_AUTHORITY | L0–L4 index |
| `architecture/frontend-ui-ux/governance/*` | CANONICAL_AUTHORITY | Cross-product contracts |
| `architecture/internationalization/` | CANONICAL_AUTHORITY (independent) | Copy/locales — not FEUX |

## Implementation contracts

| Path | Class |
|------|-------|
| `frontend/src/styles/theme.css` | CANONICAL_IMPLEMENTATION_CONTRACT |
| `frontend/src/styles/LIQUID_GLASS_SYSTEM.md` | CANONICAL_IMPLEMENTATION_CONTRACT |
| `frontend/src/styles/THEME_COLOR_CONTRACT.md` | CANONICAL_IMPLEMENTATION_CONTRACT |
| `frontend/src/styles/SURFACE_INSPIRATION_AUDIT.md` | SUPPORTING_EVIDENCE |
| `frontend/src/styles/LIGHT_MODE_SURFACE_CUTOVER_AUDIT.md` | SUPPORTING_EVIDENCE |
| `frontend/src/components/ui/` | CANONICAL_IMPLEMENTATION_CONTRACT |
| `frontend/src/components/patterns/` | CANONICAL_IMPLEMENTATION_CONTRACT |

## `docs/ui/` (Master Admin 2026-08 pack) — all HISTORICAL_SUPERSEDED

Successor: `architecture/frontend-ui-ux/products/master-admin/` + [`docs/ui/README.md`](../../../docs/ui/README.md).

| File | Class | Notes |
|------|-------|-------|
| `docs/ui/master-admin-canonical-page-framework.md` | HISTORICAL_SUPERSEDED | Pre-FEUX spec; URL/nav CONTRADICTED vs `?view=` |
| `docs/ui/master-admin-canonical-navigation-blueprint.md` | HISTORICAL_SUPERSEDED | — |
| `docs/ui/master-admin-canonical-dashboard-blueprint.md` | HISTORICAL_SUPERSEDED | — |
| `docs/ui/master-admin-canonical-organization-management-blueprint.md` | HISTORICAL_SUPERSEDED | — |
| `docs/ui/master-admin-canonical-billing-blueprint.md` | HISTORICAL_SUPERSEDED | — |
| `docs/ui/master-admin-canonical-connected-vehicles-dimo-blueprint.md` | HISTORICAL_SUPERSEDED | VO cross-ref only |
| `docs/ui/master-admin-canonical-platform-operations-blueprint.md` | HISTORICAL_SUPERSEDED | — |
| `docs/ui/master-admin-canonical-security-governance-blueprint.md` | HISTORICAL_SUPERSEDED | — |
| `docs/ui/master-admin-canonical-integrations-system-config-blueprint.md` | HISTORICAL_SUPERSEDED | — |
| `docs/ui/master-admin-*-deep-audit.md` (9 files) | SUPPORTING_EVIDENCE | Input to 2026-08 remediation |
| `docs/ui/master-admin-*-post-remediation.md` (10 files) | SUPPORTING_EVIDENCE | Not implementation SSOT |
| `docs/ui/master-admin-information-architecture-audit.md` | HISTORICAL_SUPERSEDED | FEUX-CON-001 sidebar URL claim |
| `docs/ui/master-admin-sidebar-navigation-audit.md` | SUPPORTING_EVIDENCE | — |
| `docs/ui/master-admin-app-shell-framework-audit.md` | SUPPORTING_EVIDENCE | — |
| `docs/ui/master-admin-final-cross-page-consistency-audit.md` | SUPPORTING_EVIDENCE | — |
| `docs/ui/master-admin-final-consistency-post-remediation.md` | SUPPORTING_EVIDENCE | — |
| `docs/ui/master-admin-final-ui-production-certification.md` | HISTORICAL_SUPERSEDED | **Not** production certification for agents |

## Figma prototype trees

| Path | Class | Successor |
|------|-------|-----------|
| `frontend/figma-master/` | DUPLICATE_OBSOLETE | Production: `frontend/src/master/` |
| `frontend/figma-rental/` | DUPLICATE_OBSOLETE | Production: `frontend/src/rental/` |

## Cursor / root instructions (remediated 2026-11-23)

| Path | Class | Disposition |
|------|-------|-------------|
| `.cursor/rules/Figma-rule.mdc` | CONFLICTING_INSTRUCTION → remediated | Aligned with FEUX-DEC-FIGMA-PRECEDENCE-001 |
| `.cursor/rules/projektregel.mdc` §2, §5 | CONFLICTING_INSTRUCTION → remediated | Figma reference-only default |
| `AGENTS.md` Architecture rules | CONFLICTING_INSTRUCTION → remediated | Points to `frontend-ui-ux` authority |

## Unresolved / review retained

| Item | Class | Reason |
|------|-------|--------|
| Production authenticated UI visual verification | UNRESOLVED_REVIEW_REQUIRED | FEUX-EVID-GAP-PROD-UI-001 BLOCKED |
| WCAG full conformance | UNRESOLVED_REVIEW_REQUIRED | UX-011 bounded audit only |
| Which external Figma files align with prod | UNRESOLVED_REVIEW_REQUIRED | FEUX-EVID-GAP-FIGMA-001 |

## Unique requirements migrated

Historical `docs/ui` page-framework **intent** (consistent hub headers, tab discipline) is reflected in MAUX `CURRENT_STATE.md`, screen matrices, and UX-005/UX-010 evidence — not copied verbatim from German spec docs.

## Documents removed

**None** (safe supersession only; no bulk delete).