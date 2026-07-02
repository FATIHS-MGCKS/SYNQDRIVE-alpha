/** Shared layout + tone helpers for Customer Quick View and Full Detail. */
export {
  cqv,
  customerStatusTone,
  customerRiskTone,
  customerVerificationTone,
  resolveQuickViewStatusAction,
  type QuickViewStatusAction,
} from './customer-quick-view-ui';

export const cdv = {
  page: 'mx-auto max-w-[1400px] space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]',
  headerCard: 'sq-card overflow-hidden',
  headerInner: 'px-4 py-3 sm:px-5 sm:py-4',
  metaRow: 'mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground',
  badgeRow: 'mt-2.5 flex flex-wrap items-center gap-1.5',
  actionsRow: 'mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3',
  sectionGrid: 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4',
  twoColGrid: 'grid grid-cols-1 gap-3 lg:grid-cols-2',
  summaryGrid: 'grid grid-cols-2 items-start gap-1 sm:gap-1.5 lg:grid-cols-3 xl:grid-cols-6',
} as const;

export function customerDetailTitleClass(): string {
  return 'text-[17px] font-bold leading-snug tracking-[-0.02em] text-foreground break-words sm:text-[18px]';
}

/** User-facing eligibility load failure — technical detail stays in title attribute. */
export const ELIGIBILITY_LOAD_ERROR_USER = 'Mietfreigabe konnte nicht geladen werden.';
