# I18N — Operator Header + Connectivity Banner (P2.2.44)

**Version:** V4.9.971
**Date:** 2026-08-26
**Baseline:** `e5bd8ee996940d8577d1b7e0f04bff31c06805f0`

## Overview

Localized host-owned Operator top shell chrome: header eyebrow, sync labels, refresh title, App link, aria-label, and app-network offline banner via a shared presentation adapter.

## Locale flow

```
useLanguage().locale
  → operator-shell-top-chrome-i18n.ts (ostc helpers)
  → OperatorHeader / OperatorConnectivityBanner
```

Reuses `common.loading` for organization loading state.

## Production boundary

```text
P244_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorHeader.tsx',
  'operator/components/OperatorConnectivityBanner.tsx',
  'operator/lib/operator-shell-top-chrome-i18n.ts',
]
```

## Mount

`OperatorShell` → `OperatorConnectivityBanner` (when offline) + `OperatorHeader` (all tabs)

## Connectivity semantics (frozen)

| Value | Source | Localize? |
|-------|--------|-----------|
| `online` | `navigator.onLine` | label only |
| offline message | `operator.connectivity.offlineMessage` | YES |
| vehicle/provider state | N/A | — |

## Out of scope

- `OperatorShellContext`, `operatorTypes.ts`, `OperatorBottomNav`
- P243–P216 frozen surfaces
- Fleet/DIMO (#1290, #1281), Dashboard (#1286), operational projection

## Keys

- **New:** 8 EN+DE `operator.header.*` + `operator.connectivity.*` (8624→8632)
- **Reused:** `common.loading`

## Tests

`frontend/src/operator/components/operator-shell-top-chrome-localization.test.tsx`

## Semantics

Presentation-only. Category E = 0.
