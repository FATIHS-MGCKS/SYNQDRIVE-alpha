# Changes & Architektur — Voice AI Shared Design System (2026-07-18)

## Changes

- Added `frontend/src/components/voice-ui/` — shared presentation primitives for org Voice and Master Admin surfaces.
- Components: `VoicePageShell`, `VoicePageHeader`, `VoiceStatusHero`, `VoiceMetricCard`, `VoiceActionCard`, `VoiceSectionHeader`, `VoiceStepIndicator`, `VoiceHealthBanner`, `VoiceEmptyState`, `VoiceSkeleton`, `VoiceInlineNotice`, `VoiceProviderDiagnostic`, `VoiceConfirmationDialog`, `VoiceResponsiveTabs`, `VoiceDetailDrawerShell`.
- Shared tokens in `voice-ui.tokens.ts` (touch targets, surfaces, status tones, focus rings, reduced-motion classes).
- Fixtures + Vitest coverage for loading, empty, warning, degraded, blocked, success, disabled presentation states.

**Not in scope (Prompt 4A):** wizard refactor, operations dashboard, master admin redesign, provider actions, or migration of existing voice views to the new primitives.

## Architektur

### Layering

| Layer | Path | Responsibility |
|-------|------|----------------|
| Shared patterns | `frontend/src/components/patterns` | Product-wide PageHeader, MetricCard, DetailDrawer, ConfirmDialog |
| Voice UI kit | `frontend/src/components/voice-ui` | Voice-specific composition + tokens only |
| Org voice views | `frontend/src/rental/components/voice-assistant` | Business logic, API, wizard/ops (future adoption of voice-ui) |
| Master voice | `frontend/src/master/components/voice-control-plane` | Secure actions, control plane (future adoption of voice-ui) |

### Design constraints

- Reuses SynqDrive tokens: `surface-premium`, `surface-frosted`, `--status-*`, `--brand`, `sq-press`, `chrome-tab-bar`.
- Presentation-only: no API calls, entitlements, or provider identifiers in generic components.
- `VoiceProviderDiagnostic` accepts caller-defined rows (`id`, `label`, `value`, `status`).
- Accessibility: 44px touch targets on tabs, `role="alert"` / `role="status"` on banners, visible focus rings, `motion-reduce` on animations.

### Adoption path (later prompts)

1. Replace bespoke headers/KPI strips in `VoiceAssistantView` / `VoiceCommandHeader` with `VoicePageHeader` + `VoiceStatusHero`.
2. Align `VoiceOpsSectionNav` with `VoiceResponsiveTabs`.
3. Master control plane drawers → `VoiceDetailDrawerShell`; secure writes remain in `VoiceSecureActionDialog` (business layer).
