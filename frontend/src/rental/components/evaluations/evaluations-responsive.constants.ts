/** Shared responsive layout tokens for Auswertungen (Prompt 34/54). */

/** KPI card grids: 1 col on narrow phones, 2 from ~360px, 4 on large screens. */
export const EVALUATIONS_KPI_GRID_CLASS =
  'grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 lg:grid-cols-4';

/** Two-column insight / chart grids. */
export const EVALUATIONS_DUAL_GRID_CLASS = 'grid grid-cols-1 gap-4 xl:grid-cols-2';

/** Minimum touch target (WCAG 2.5.5 advisory 44×44). */
export const EVALUATIONS_TOUCH_TARGET_CLASS = 'min-h-[44px] min-w-[44px]';

/** Page shell with safe areas and no horizontal bleed. */
export const EVALUATIONS_PAGE_SHELL_CLASS =
  'mx-auto max-w-[1600px] space-y-4 overflow-x-hidden px-3 sm:px-4 pb-[max(1rem,env(safe-area-inset-bottom))]';

/** Sticky section nav with safe-area top inset. */
export const EVALUATIONS_STICKY_NAV_CLASS =
  'sticky top-0 z-20 -mx-1 mb-1 overflow-x-auto overscroll-x-contain rounded-xl border border-border/40 bg-background/90 px-2 py-2 backdrop-blur-md pt-[max(0.5rem,env(safe-area-inset-top))] [scrollbar-width:thin]';

/** Hide complex Recharts on narrow viewports — table alternative remains visible. */
export const EVALUATIONS_CHART_DESKTOP_ONLY_CLASS = 'hidden md:block';

/** Mobile hint when chart is hidden. */
export const EVALUATIONS_CHART_MOBILE_HINT_CLASS =
  'md:hidden rounded-lg border border-border/40 bg-muted/25 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground';

/** Responsive filter select. */
export const EVALUATIONS_FILTER_SELECT_CLASS =
  'h-11 min-h-[44px] min-w-[9.5rem] shrink-0 rounded-lg border border-border bg-background px-3 text-xs';

/** Tabular amounts — scale down on very narrow screens. */
export const EVALUATIONS_KPI_VALUE_CLASS =
  'text-[clamp(1.05rem,4.5vw,1.3125rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums break-words';
