# Figma and Visual Precedence (Mandatory)

**Status:** VALIDATED  
**Decision:** FEUX-DEC-FIGMA-PRECEDENCE-001  
**Evidence:** FEUX-EVID-GAP-FIGMA-001 (no in-repo Figma SSOT)

## Default design contract

For everyday implementation and bug fixes, the **default visual contract** is:

1. Registered **Shared UI Design Foundation** + product UI/UX authorities (`architecture/frontend-ui-ux/`).
2. **Implemented** tokens and components (`theme.css`, `SHARED_DESIGN_SYSTEM.md`, `components/ui`, `components/patterns`).
3. Product-specific `CURRENT_STATE.md` and screen inventories.

The **codebase** is the source of truth for **functionality**, routing, and data flow.

## Role of Figma

| Context | Figma role |
|---------|------------|
| Owner-approved **redesign** or new visual target (explicit task) | **Design reference** or **approved target** — must be reconciled with authority via [`FUTURE_DESIGN_CHANGE_POLICY.md`](./FUTURE_DESIGN_CHANGE_POLICY.md) |
| Routine fix, a11y, i18n, state bug, table/dialog behavior | **Optional** reference only; **do not** override current architecture silently |
| Older or unverified Figma file vs current implementation | **Document conflict**; verify intended target with owner — **do not invent** design intent |
| Figma MCP available | Use for **inspection** when task explicitly scopes visual alignment to an approved Figma artifact |

**Figma is not** the unconditional universal visual SSOT for SYNQDRIVE-alpha agents.

## Conflict resolution

When Figma (or legacy `docs/ui` specs) disagree with the running SPA:

1. Prefer **registered architecture + implemented tokens** unless the task is an **approved redesign**.
2. **Preserve** functional UI that exists in code but not in Figma or old docs (harmonize visually to current design language).
3. Record material conflicts in the owning product authority (`OPEN_CONTRADICTIONS.md` or evidence) when discovered during work.
4. Do **not** remove working features solely because an old Figma omit lists them.

## Out-of-repo prototypes

`frontend/figma-master/` and `frontend/figma-rental/` are **partial prototype stubs** — not production routes or authorities. See each folder `README.md`.

## Related decisions

- FEUX-DEC-SHARED-TOKEN-SSOT-001 — `theme.css` as shared visual SSOT
- FEUX-DEC-AGENT-READ-FIRST-001 — mandatory authority read order