# Open Contradictions — Frontend UI/UX

| ID | Epistemic | Sources | Statement | Impact |
|----|-----------|---------|-----------|--------|
| FEUX-CON-001 | CONTRADICTED | `docs/ui/master-admin-information-architecture-audit.md` vs `master/navigation/master-nav-url.ts` + `master/App.tsx` | Doc claims sidebar nav does not write URL on navigate; code uses `pushMasterNavState` / `popstate` | Doc misleads IA reviewers |
| FEUX-CON-002 | CONTRADICTED | `docs/ui` (Aug 2026 nav groups default collapsed) vs `master-nav.config.ts` | Doc default collapsed; code `defaultExpanded: true` on most groups | Discoverability narrative outdated |
| FEUX-CON-003 | CONTRADICTED | `docs/ui` page framework DE keys vs `master-nav-i18n.ts` | Framework cites i18n keys; Master chrome uses hardcoded DE map | Violates platform i18n contract (owned by i18n authority) |
| FEUX-CON-004 | CONTRADICTED | Changes changelog brand `#2563EB` vs `theme.css` `--brand: #4F86E8` | Historical changelog vs current token | Designers may use wrong brand |
| FEUX-CON-005 | PARTIALLY_VERIFIED | Page framework «all views in PageContainer» vs `master/App.tsx` | `ProductManagementView` rendered without `PageContainer` | Layout inconsistency |

**Resolution status:** Recorded only — no code/doc fixes in bootstrap PR.