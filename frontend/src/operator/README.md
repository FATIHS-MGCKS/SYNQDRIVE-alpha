# SynqDrive Operator (Web / PWA foundation)

Mobile/tablet-only field operations shell at `/operator`.

## Entry

- Topbar button **Operator** (rental + master apps), visible for `MASTER_ADMIN`, `ORG_ADMIN`, `SUB_ADMIN`, `WORKER`.
- Desktop: opens modal with copyable `/operator` URL.
- Mobile/tablet: navigates directly to `/operator`.

## Device guard (UX only)

`useIsOperatorDevice` treats viewports ≤1280px or coarse pointer as operator devices.  
Development escape: `VITE_ALLOW_OPERATOR_DESKTOP=true` in `.env.local`.

## Security

`canAccessOperatorApp()` is a frontend gate only; backend APIs remain org-scoped.  
Not a substitute for server-side authorization.

## Next steps (TODO)

Wire placeholders in `OperatorShell` to existing handover, damage, and task flows — no duplicate backends.
