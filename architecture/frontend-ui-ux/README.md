# Frontend UI/UX & Design System — Living Architecture Authority (Bootstrap)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority-native status** | Bootstrap audit V1 (2026-11-22) · repository audit **CONFIRMED** · Production UI **NOT_STARTED** |
| **Maturity** | Shared tokens/patterns **SUBSTANTIAL** · Master hub framework **SUBSTANTIAL** · Rental reference profile **PARTIAL** · Operator mobile shell **PARTIAL** · Cross-product governance **BOOTSTRAP** |
| **Runtime impact** | All three SPA surfaces (`/master`, `/rental`, `/operator/*`) consume shared frontend tokens and components; no separate deployable UI runtime |

## What this module owns

`architecture/frontend-ui-ux/` is the **canonical architectural memory** for SynqDrive Alpha **shared visual/interaction foundation** and **product UI contracts**:

- Shared design tokens and surface policy (`frontend/src/styles/*`)
- Shared UI primitives and patterns (`frontend/src/components/ui`, `patterns`, `shell`, `surface`)
- **Product profiles** (separate UX rules, not separate token systems):
  - **Master Admin** (Core control plane) — `frontend/src/master/**`
  - **Rental** (primary org operations reference) — `frontend/src/rental/**`
  - **Operator** (mobile field shell) — `frontend/src/operator/**`

## Critical boundaries (non-scope)

| Boundary | Owner / rule |
|----------|----------------|
| Translation keys, locale catalogs, i18n CI | [`architecture/internationalization/`](../internationalization/) — **no duplicate i18n authority** |
| Backend API presentation / DTO copy | Owning backend modules |
| Figma files / visual redesign implementation | Out of scope until separately tasked; this authority records **code SSOT** + known doc drift |
| Platform Admin business logic | Backend + existing Master module docs under `docs/ui/` (historical evidence) |
| Per-feature domain UI (trips, health, billing calculations) | Owning module authorities consume shared patterns |

## Owner decision (product architecture)

**CONFIRMED (owner directive, 2026-11-22):** One **platform design-system authority** with **three product UI/UX profiles**. Rental is a **positive design reference** for polish and density patterns; Master Admin remains an **independent control-plane** (no automatic Rental nav/layout copy).

See [FEUX-DEC-PLATFORM-PROFILES-001](./decisions/DECISION_REGISTER.md).

## Epistemic states

| State | Meaning |
|-------|---------|
| `CONFIRMED` | Supported by inspected code at recorded SHA |
| `INFERRED` | Reasonable from structure/tests; not browser-verified |
| `HISTORICAL` | Prior audit/docs; may be superseded by code |
| `UNKNOWN` | Not verified (Production render, Figma, responsive screenshots) |
| `CONTRADICTED` | Doc vs code disagreement recorded explicitly |

## Mandatory entry documents

| Document | Purpose |
|----------|---------|
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Best-known snapshot (repository; Production UI open) |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Human-readable graph overview |
| [AGENT_CONTRACT.md](./AGENT_CONTRACT.md) | Rules for future agents |
| [design-system/SHARED_DESIGN_SYSTEM.md](./design-system/SHARED_DESIGN_SYSTEM.md) | Token/surface/pattern SSOT pointers |
| [products/master-admin/PRODUCT_PROFILE.md](./products/master-admin/PRODUCT_PROFILE.md) | Master control-plane UI contract |
| [products/rental/PRODUCT_PROFILE.md](./products/rental/PRODUCT_PROFILE.md) | Rental operations UI contract |
| [products/operator/PRODUCT_PROFILE.md](./products/operator/PRODUCT_PROFILE.md) | Operator mobile UI contract |
| [inventories/RENTAL_MASTER_COMPARISON.md](./inventories/RENTAL_MASTER_COMPARISON.md) | Evidence-based comparison matrix |
| [decisions/DECISION_REGISTER.md](./decisions/DECISION_REGISTER.md) | Decision register |
| [evidence/EVIDENCE_INDEX.md](./evidence/EVIDENCE_INDEX.md) | Evidence by stable ID |

## Supporting evidence (not default authority)

- `docs/ui/master-admin-*.md` — Master UI phase audits/blueprints (much content **HISTORICAL** vs `origin/main`)
- `frontend/src/styles/*.md` — Token/surface contracts (**CONFIRMED** technical SSOT for CSS)
- Prior read-only audit transcript baseline SHA `01bd08a4` (reconciled to `413175e8c` where noted)

## Validation

```bash
bash architecture/frontend-ui-ux/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

## Neighboring authorities

| Authority | Relationship |
|-----------|----------------|
| [Internationalization](../internationalization/) | Locale/copy; Master `tMasterNav` debt is **cross-reference**, not owned here |
| [Platform Master Plan](../platform-reorientation/SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) | Core/Rental/Operator product boundaries |
| [DSRG](../dsrg/) | Deploy/runtime; not UI rendering |

## Last updated

2026-11-22 — Bootstrap audit V1 (`AUDIT_IN_PROGRESS`).