# I18N — Rental Vehicle Damages (P2.2.61)

## Scope

Localized the rental vehicle damage control center mounted stack:

- `DamagesView` and all `rental/components/damages/*` UI surfaces
- Shared presentation helpers: `damage-summary-display.ts`, `damage-control.utils.ts`
- Domain libs: `damage-insights.ts`, `damage-rental-impact.ts`, `damage-pickup-context.ts`
- Hooks: `useVehicleDamages`, `useVehicleDamageActions`, `useDamageAiIntake`

## Adapter

`frontend/src/rental/lib/rental-vehicle-damages-i18n.ts`

- Namespace: `vehicleDamages.*`
- Reuses `operator.damageCapture.*` for damage type, severity, rental impact, and source where semantically identical
- Unknown machine values fall back to raw enum strings (never mapped to `OTHER`)
- Host errors via `VehicleDamageHostErrorKey`; toasts via typed success/error keys
- Locale-aware `formatDamageDateLocale` / `formatDamageEuroCents`

## Mutation safety

- Payload enums, IDs, coordinates, API contracts unchanged
- `locationLabel` free text stays raw; `locationView` localized
- Raw `description`, `liabilityNote`, task titles, image filenames, backend errors stay raw
- Pickup context `reason` stored as machine codes (`DamagePickupReasonCode`)

## Enforce-clean

`P261_ENFORCE_CLEAN_EXACT` — 23 paths in `i18n-hardcoded-scan.mjs` and `hardcoded-copy-guard.test.ts`

## Out of scope

- `DataAnalyseView.tsx`
- `operator/damages/*`
- Repair task title/description builders (`damage-repair-task.ts`) — remain backend-oriented English templates
