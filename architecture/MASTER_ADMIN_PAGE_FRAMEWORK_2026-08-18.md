# Master Admin Page Framework

**Date:** 2026-08-18  
**Phase:** UI-3

## Overview

Master Admin content (right of sidebar) uses a shared page framework under `frontend/src/master/shell/`, mounted from `App.tsx` via `MasterAdminShell` + per-view `PageContainer`.

## Shell layout

```
MasterAdminShell (AppShell variant="master")
├── Sidebar (navigation — UI-1.4)
├── overlays: Toaster, MfaStepUpDialog
└── <main id="master-main">
    ├── MasterMfaGate
    │   ├── MasterGlobalChrome (TopBar)
    │   └── PageContainer (standard | wide | full)
    │       └── *View (MasterPageHeader + content)
```

## PageContainer variants

| Variant | Max width | Views |
|---------|-----------|-------|
| `standard` | 1400px | Default (orgs, users, settings, …) |
| `wide` | 1600px | Dashboard, Billing, Voice |
| `full` | none | Support Ops |

Shell gutters remain in `app-shell.tsx` (`px-4 sm:px-6 lg:px-8`). Master variant no longer sets `max-w` on the shell inner wrapper.

## Header & tabs

- **MasterPageHeader** — extends `PageHeader`; supports `back`, integrated `MasterPageTabs`
- **MasterPageTabs** — single tab system (`chrome-tab-bar`); replaces per-view pill/sq-tab-bar implementations
- Settings `settingsTab=monitoring` redirects to `platform-health` (no embedded `SystemMonitoringView`)

## Scroll rules

- Main column scrolls (`overflow-auto`)
- Removed: global RightSidebar; HM view inner scroll; view-level max-width wrappers
- Exceptions: Support Ops panel scroll; Architektur sticky doc nav; modal/drawer bodies

## Tokens

CSS vars in `frontend/src/styles/theme.css`: `--master-shell-max-standard`, `--master-shell-max-wide`, `--master-page-stack`, `--master-section-gap`.

## Docs

- Spec: `docs/ui/master-admin-canonical-page-framework.md`
- Post-remediation: `docs/ui/master-admin-page-framework-post-remediation.md`
