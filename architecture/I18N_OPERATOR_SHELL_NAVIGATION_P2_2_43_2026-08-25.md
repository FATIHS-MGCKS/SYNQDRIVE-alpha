# I18N — Operator Shell Navigation Chrome (P2.2.43)

**Version:** V4.9.970
**Date:** 2026-08-25
**Baseline:** `509d0ce129402dc2e578e2866b83e4ef09ab52d3`

## Overview

Localized host-owned Operator bottom navigation chrome (tab labels + nav `aria-label`) via a bounded presentation adapter. Tab machine IDs, ordering, callbacks, and shell state remain frozen.

## Locale flow

```
useLanguage().locale
  → operator-shell-navigation-i18n.ts (osn helpers)
  → OperatorBottomNav
```

Reuses `common.today` and `nav.tasks` for Today and Tasks tabs.

## Production boundary

```text
P243_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBottomNav.tsx',
  'operator/lib/operator-shell-navigation-i18n.ts',
]
```

## Mount

`OperatorShell` → fixed bottom `<nav>` (mobile/tablet primary navigation)

## Tab machine-ID freeze

| Machine ID | TranslationKey | React key | Callback arg |
|------------|----------------|-----------|--------------|
| `today` | `common.today` | `today` | `today` |
| `scan` | `operator.navigation.tab.scan` | `scan` | `scan` |
| `vehicles` | `operator.navigation.tab.vehicles` | `vehicles` | `vehicles` |
| `tasks` | `nav.tasks` | `tasks` | `tasks` |
| `more` | `operator.navigation.tab.more` | `more` | `more` |

## Out of scope

- `OperatorShellContext` — tab + scan query state
- `operatorTypes.ts` — `OperatorTab` union
- `OperatorHeader`, `OperatorConnectivityBanner` — P244
- P242–P216 frozen surfaces
- Fleet/DIMO (#1290), fleet health (#1277), dashboard (#1286)

## Keys

- **New:** 4 EN+DE `operator.navigation.*` (8620→8624)
- **Reused:** `common.today`, `nav.tasks`

## Tests

`frontend/src/operator/components/operator-shell-navigation-localization.test.tsx`

## Semantics

Presentation-only. Category E = 0.
