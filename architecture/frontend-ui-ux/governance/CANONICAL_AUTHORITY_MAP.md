# Canonical UI/UX Authority Map (Normative)

**Status:** VALIDATED (governance documentation, 2026-11-23)  
**Supersedes:** informal routing via `docs/ui/*`, unconditional Figma-as-SSOT agent rules

## One authority tree

All **current** UI/UX architectural memory for SYNQDRIVE-alpha lives under:

```
architecture/frontend-ui-ux/
├── README.md                    # Shared UI Design Foundation (registry module)
├── design-system/
│   └── SHARED_DESIGN_SYSTEM.md  # L0–L4 + implementation index
├── governance/                  # Cross-product contracts (this folder)
├── inventories/
├── products/
│   ├── master-admin/            # Master Admin UI/UX
│   ├── rental/                  # Rental UI/UX
│   └── operator/                # Operator UI/UX
└── evidence/
```

**Internationalization** remains an independent authority: `architecture/internationalization/`.

## Four ownership domains

| Domain | Registry module | Authority path | Owns |
|--------|-----------------|--------------|------|
| Shared design foundation | Shared UI Design Foundation | `architecture/frontend-ui-ux/` | Tokens, L0–L4 surfaces, shared `components/ui` + `patterns`, cross-product change policy |
| Master control plane | Master Admin UI/UX | `architecture/frontend-ui-ux/products/master-admin/` | `/master` shell, `?view=` navigation, hubs, Master screen matrix |
| Rental product | Rental UI/UX | `architecture/frontend-ui-ux/products/rental/` | `/rental` views, fleet chrome, Rental screen matrix |
| Operator product | Operator UI/UX | `architecture/frontend-ui-ux/products/operator/` | `/operator/*` mobile shell, bottom nav, field workflows |

## Implementation contracts (code SSOT)

These are **not** separate competing authorities; they are **named implementation sources** indexed by the shared foundation:

| Asset | Role |
|-------|------|
| `frontend/src/styles/theme.css` | Canonical design tokens |
| `frontend/src/styles/LIQUID_GLASS_SYSTEM.md` | L2/L3 liquid glass rules |
| `frontend/src/styles/THEME_COLOR_CONTRACT.md` | Color semantics |
| `frontend/src/components/ui/` | shadcn/Radix primitives |
| `frontend/src/components/patterns/` | Composed product patterns |

## Agent routing (mandatory)

Before **any** frontend/UI work (bug fix, layout, dialog, table, navigation, responsive, shared component):

1. Read [`../README.md`](../README.md) and [`../AGENT_CONTRACT.md`](../AGENT_CONTRACT.md).
2. Read [`design-system/SHARED_DESIGN_SYSTEM.md`](../design-system/SHARED_DESIGN_SYSTEM.md).
3. Read [`CROSS_PRODUCT_CHANGE_POLICY.md`](./CROSS_PRODUCT_CHANGE_POLICY.md).
4. Read [`FIGMA_AND_VISUAL_PRECEDENCE.md`](./FIGMA_AND_VISUAL_PRECEDENCE.md).
5. Read the **product** `AGENT_CONTRACT.md`, `CURRENT_STATE.md`, and screen inventory for every affected surface.
6. If user-visible copy changes: read `architecture/internationalization/` entry documents.

Classify the change: `PRODUCT_LOCAL_CHANGE` vs `SHARED_FOUNDATION_CHANGE` per cross-product policy.

## Prohibited

- Creating a parallel in-repo “design system” or UI authority tree without owner approval.
- Treating `docs/ui/*` (2026-08 Master remediation pack) as current canonical guidance.
- Treating `frontend/figma-master/` or `frontend/figma-rental/` prototype trees as production UI authority.

## Evidence

- FEUX-DEC-INDEPENDENT-AUTHORITIES-002
- FEUX-DEC-AGENT-READ-FIRST-001
- FEUX-EVID-AGENT-ROUTING-2026-11-23