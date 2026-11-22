# Current State — Shared UI Design Foundation

**Repository UI SHA:** `413175e8ca72355764a3d47936ad7eff78d415aa` (screen contracts) · **Repository `main`:** `874f69e61bbed8465c5e94cd88d91408ee281acc` (#2490 merged).

## Production (P7 read-only, CONFIRMED infra)

| Field | Value |
|-------|-------|
| Production release SHA | `1e6a267c8c7951e2a11633e89ab96714844ea846` (`2026-11-11`) |
| Drift | **Production behind `main`** — doc-only FEUX merge not deployed |
| Served bundle | Single SPA: `index-Cn8n4pFR.js` + `index-DmctIvoe.css` |
| Shared coupling at runtime | **CONFIRMED** — one bundle serves Master, Rental, Operator |
| Authenticated UI | **UNKNOWN** |

Detail: [`evidence/PRODUCTION_BASELINE.md`](./evidence/PRODUCTION_BASELINE.md), [`evidence/PRODUCTION_GATE_A_AUDIT_2026-11-22.md`](./evidence/PRODUCTION_GATE_A_AUDIT_2026-11-22.md).

## Executive summary

One Vite SPA serves three product trees (`/master`, `/rental`, `/operator/*`). Visual foundation is **centralized** in `frontend/src/styles/theme.css` and style contracts (`LIQUID_GLASS_SYSTEM.md`, surface docs) plus shared React primitives (`components/ui`, `components/patterns`, `components/shell`).

**Governance** is now **four registry modules** (INFERRED consumer counts beyond spot checks) (this foundation + three product UI/UX authorities). **Technical coupling remains:** a token edit can change all products until scoped overrides exist — documented under `governance/CROSS_PRODUCT_CHANGE_POLICY.md`.

## Token and surface layer (CONFIRMED)

- Brand `#4F86E8`, Manrope/Geist Mono, L0–L4 surfaces, motion easing variables.  
- Legacy `.sq-*` aliases coexist with `.surface-*` (migration state, not second framework).

## Shared component consumers

Authoritative inventory: [`inventories/SHARED_COMPONENTS.md`](./inventories/SHARED_COMPONENTS.md).

| Consumer | Intensity |
|----------|-----------|
| Master | Heavy ui + patterns in hubs |
| Rental | Heaviest pattern/KPI usage |
| Operator | Selective ui + glass surfaces |

## Cross-product rules (VALIDATED)

| Rule | Meaning |
|------|---------|
| PRODUCT_LOCAL_CHANGE | Product doc/UX work stays in product authority unless shared contracts shift |
| SHARED_FOUNDATION_CHANGE | Token/primitive edits require impact analysis |
| NO_SILENT_PROPAGATION | Master-only visual intent must not rely on unscoped globals |
| PRODUCT_SPECIFIC_EVOLUTION | Visual divergence allowed per product authority |

## i18n boundary (CONFIRMED)

Copy/locale owned by `architecture/internationalization/`. Master chrome debt tracked in MAUX authority.

## Production vs repository

Production not read. **UNKNOWN** deployed SHA and runtime feature flags affecting liquid glass.

## Explicit non-claims

- No second CSS framework.  
- No complete technical isolation.  
- Validator PASS ≠ full UX audit.

## Product authorities (pointers)

| Product | Path |
|---------|------|
| Master | `products/master-admin/CURRENT_STATE.md` |
| Rental | `products/rental/CURRENT_STATE.md` |
| Operator | `products/operator/CURRENT_STATE.md` |

## Validation and promotion

All four modules remain `AUDIT_IN_PROGRESS`. Gate A requires Production read-only UI per product plus reconciliation with this foundation. Graph validators enforce artifact completeness gates; they do **not** certify exhaustive component-level audits.