/* ════════════════════════════════════════════════════════════════════
   Voice UI — shared design system for org Voice and Master Admin surfaces.
   Presentation-only primitives; no business logic or provider coupling.
   ════════════════════════════════════════════════════════════════════ */

export {
  VOICE_TOUCH_TARGET,
  VOICE_PANEL_CLASS,
  VOICE_CHROME_CLASS,
  VOICE_FOCUS_RING,
  VOICE_PRESS_CLASS,
  VOICE_FADE_CLASS,
  VOICE_PAGE_MAX_WIDTH,
  VOICE_PAGE_PADDING,
  voiceStatusSurfaceClass,
  voiceInteractiveClass,
} from './voice-ui.tokens';

export type {
  VoiceSurfaceTone,
  VoicePresentationState,
  VoiceTabItem,
  VoiceStepItem,
  VoiceDiagnosticRow,
} from './voice-ui.types';

export { voiceSurfaceToneToStatus } from './voice-ui.types';

export { VoicePageShell } from './VoicePageShell';
export type { VoicePageShellProps } from './VoicePageShell';

export { VoicePageHeader } from './VoicePageHeader';
export type { VoicePageHeaderProps } from './VoicePageHeader';

export { VoiceStatusHero } from './VoiceStatusHero';
export type { VoiceStatusHeroProps } from './VoiceStatusHero';

export { VoiceMetricCard } from './VoiceMetricCard';
export type { VoiceMetricCardProps } from './VoiceMetricCard';

export { VoiceActionCard } from './VoiceActionCard';
export type { VoiceActionCardProps } from './VoiceActionCard';

export { VoiceSectionHeader } from './VoiceSectionHeader';
export type { VoiceSectionHeaderProps } from './VoiceSectionHeader';

export { VoiceStepIndicator } from './VoiceStepIndicator';
export type { VoiceStepIndicatorProps } from './VoiceStepIndicator';

export { VoiceHealthBanner } from './VoiceHealthBanner';
export type { VoiceHealthBannerProps } from './VoiceHealthBanner';

export { VoiceEmptyState } from './VoiceEmptyState';
export type { VoiceEmptyStateProps } from './VoiceEmptyState';

export { VoiceSkeleton, VoiceSkeletonGrid } from './VoiceSkeleton';
export type { VoiceSkeletonProps, VoiceSkeletonGridProps } from './VoiceSkeleton';

export { VoiceInlineNotice } from './VoiceInlineNotice';
export type { VoiceInlineNoticeProps } from './VoiceInlineNotice';

export { VoiceProviderDiagnostic } from './VoiceProviderDiagnostic';
export type { VoiceProviderDiagnosticProps } from './VoiceProviderDiagnostic';

export { VoiceConfirmationDialog } from './VoiceConfirmationDialog';
export type { VoiceConfirmationDialogProps } from './VoiceConfirmationDialog';

export { VoiceResponsiveTabs } from './VoiceResponsiveTabs';
export type { VoiceResponsiveTabsProps } from './VoiceResponsiveTabs';

export { VoiceDetailDrawerShell } from './VoiceDetailDrawerShell';
export type { VoiceDetailDrawerShellProps } from './VoiceDetailDrawerShell';
