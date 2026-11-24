# Change Ledger — Shared UI Design Foundation (append-only)

| Date (UTC) | ID | Change | Evidence |
|------------|-----|--------|----------|
| 2026-11-22 | FEUX-BOOTSTRAP-001 | Create `architecture/frontend-ui-ux/`; registry row `AUDIT_IN_PROGRESS`; no product code changes | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| 2026-11-22 | FEUX-SPLIT-002 | Split independent Master/Rental/Operator authorities; supersede profile-only model; cross-product policy | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| 2026-11-22 | FEUX-CLOSEOUT-003 | Complete MODULE_AUTHORITY_STANDARD decision fields; manifest SHA metadata; inventory + validator semantic gates (no product code) | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| 2026-11-22 | FEUX-P7-PROD-001 | Owner read-only Production VPS + HTTP audit; Gate A conditional; consolidated PRODUCTION_GATE_A report | FEUX-EVID-PROD-INFRA-2026-11-22 |
| 2026-11-22 | FEUX-P7-RECON-001 | Full-tree git drift reconciliation; source provenance epistemics; SPA asset-200 finding | FEUX-EVID-PROD-DRIFT-2026-11-22 |
| 2026-11-22 | FEUX-P8-AUTH-001 | Authenticated functional UI audit blocked (no approved session); matrix + drift recheck 108 paths | FEUX-EVID-P8-AUTH-GATE-001 |
| 2026-11-22 | FEUX-P8-RECHECK-001 | VPS SSH/access recheck; clarify SSH≠browser session; inventory Playwright/smoke paths | FEUX-EVID-P8-ACCESS-RECHECK-001 |
| 2026-11-22 | FEUX-P9-FOUNDATION-001 | UI audit platform permissions; UiAuditWriteDenyGuard; matrix + runbook | FEUX-EVID-P9-AUDIT-FOUNDATION-001 |
| 2026-11-22 | FEUX-P9B-SECURITY-001 | Product-scoped read allowlist; RolesGuard master audit reads; SPA master shell; Playwright origin/storageState harness | FEUX-EVID-P9B-SECURITY-CLOSEOUT-001 |
| 2026-11-22 | FEUX-P9B-TENANT-REVOKE-001 | Master sensitive endpoint denial; session enforcement guard; HTTP tenant/revocation integration tests | FEUX-EVID-P9B-TENANT-REVOKE-001 |
| 2026-11-22 | FEUX-P9B-REAL-ENDPOINT-001 | Response-level master endpoint blocking; connectivity-only allow; overlap grant OR; PlatformAdminController audit HTTP tests | FEUX-EVID-P9B-REAL-ENDPOINT-001 |
| 2026-11-23 | FEUX-P9-RETIRE-001 | Owner decision: remove P9 runtime; retain migration + evidence; restore standard auth routing | FEUX-EVID-P9-RETIRED-2026-11-23 |
| 2026-11-23 | FEUX-BASELINE-FINAL-001 | Consolidated code-verified UI/UX baseline + prioritized improvement backlog (MAUX/RENTUX/OPUX/FEUX) | FEUX-EVID-BASELINE-FINAL-2026-11-23 |
| 2026-11-23 | FEUX-UX-001-002 | UX-001 baseline correction (product-management PageContainer in-view); UX-002 `SHELL_LAYOUT_CONTRACT.md` | FEUX-EVID-UX001-002-2026-11-23 |
| 2026-11-23 | RENTUX-UX-003 | Vehicle detail tab count 9; active-tab scroll visibility fix | RENTUX-EVID-UX003-2026-11-23 |
| 2026-11-23 | FEUX-UX-004 | Bookings planner state consistency; Operator Today pattern attestation | FEUX-EVID-UX004-2026-11-23 |
| 2026-11-23 | MAUX-UX-005 | Organization detail responsive tabs; shared MasterPageTabs scroll visibility | MAUX-EVID-UX005-2026-11-23 |
| 2026-11-23 | FEUX-UX-006 | Tri-product navigation/URL contract (Master query, Rental hybrid, Operator paths) | FEUX-EVID-UX006-2026-11-23 |
| 2026-11-23 | RENTUX-UX-007 | Legacy communication view ids removed from active Rental view union | RENTUX-EVID-UX007-2026-11-23 |
| 2026-11-23 | OPUX-UX-008 | Operator deep-link route matching + `/operator/scan` registration | OPUX-EVID-UX008-2026-11-23 |
| 2026-11-23 | FEUX-UX-009 | Targeted i18n on UX-004 surfaces (bookings planner load error; Operator Today chrome) | FEUX-EVID-UX009-2026-11-23 |
| 2026-11-23 | FEUX-UX-011 | Cross-product a11y closeout — org wizard, booking sheet, DataTable `aria-busy` | FEUX-EVID-UX011-2026-11-23 |
| 2026-11-23 | FEUX-UX-CAMPAIGN | UX-001–UX-011 merge register + ledger/index reconciliation (doc-only) | FEUX-EVID-UX001-011-MERGE-2026-11-23 |
| 2026-11-23 | FEUX-AUTHORITY-001 | Canonical authority map, Figma precedence, legacy inventory, agent rules + routing validator | FEUX-EVID-AGENT-ROUTING-2026-11-23 |
| 2026-11-23 | FEUX-MAUX-2517-SHARED-NAV | Bounded shared shell: `subNavItemClass` 36px rhythm + `CollapsedNavTooltip` focus visibility (Master+Rental); Operator unaffected | [FEUX-EVID-MAUX2517-SHARED-SHELL-NAV-2026-11-23.md](../evidence/FEUX-EVID-MAUX2517-SHARED-SHELL-NAV-2026-11-23.md) |
