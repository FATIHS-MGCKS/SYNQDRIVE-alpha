# Vehicle Detail Page — Mobile Readiness (2026-07)

## Scope

Prompt 27/36: secure full mobile readiness without visual redesign.

## Viewports covered (Playwright)

| Project | Size | Orientation |
|---------|------|-------------|
| mobile-320 | 320×568 | Portrait |
| mobile-360 | 360×640 | Portrait |
| mobile-375 | 375×812 | Portrait |
| mobile-390 | 390×844 | Portrait |
| mobile-430 | 430×932 | Portrait |
| tablet-768 | 768×1024 | Portrait |
| landscape-375 | 812×375 | Landscape |

Additional checks: 200% text zoom (CSS), touch-target minimums on sub-640px widths.

## Layout fixes (no redesign)

- `vehicle-detail-mobile-ui.ts` — shared overflow, safe-area, touch-target tokens
- `App.tsx` — `vehicle-detail-view` shell, tab `role="tablist"`/`role="tab"`, trips filter horizontal scroll row, 44px mobile tab triggers
- `VehicleDetailHeader` — 44px back button, chip trigger min-height, truncation test ids, overflow clip
- `VehicleTasksView`, `VehicleRequirementsTab`, `vehicle-bookings-ui` — `min-w-0 overflow-x-clip`

## E2E

- `e2e/vehicle-detail-mobile.spec.ts` — overflow, all tabs, long meta truncation, touch targets, trips filters, zoom, landscape
- `e2e/vehicle-detail-baseline-fixtures.ts` — vehicle detail API mocks + navigation helpers
- Screenshots: `playwright-report/vehicle-detail-mobile-*-{project}.png`

## Intentionally unchanged

- Map interaction model (Mapbox canvas; HUD already uses `vehicle-detail-map-hud` safe-area CSS)
- Tab bar not sticky (matches current product; horizontal scroll preserved)
- Health box compliance mixed-language copy (Prompt 26 follow-up)

## Run

```bash
cd frontend && npx playwright test vehicle-detail-mobile.spec.ts -c e2e/playwright.config.ts
```
