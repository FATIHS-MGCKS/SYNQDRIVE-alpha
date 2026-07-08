import type { StatusTone } from '../../../components/patterns';
import {
  customerRiskUiLabelDe,
  type CustomerUiRisk,
  type CustomerUiStatus,
  type CustomerUiVerification,
} from '../../lib/entityMappers';

/** Layout tokens for the full CustomerDetailView page. */
export const cdv = {
  page: 'mx-auto max-w-[1400px] space-y-3 pb-[max(5.5rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]',
  headerCard: 'sq-card overflow-hidden',
  headerInner: 'px-4 py-3.5 sm:px-5 sm:py-4',
  backLink:
    'inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground',
  heroTopRow: 'mt-2.5 flex items-start justify-between gap-3',
  /** @deprecated use heroTopRow */
  heroTitleRow: 'mt-2.5 flex items-start justify-between gap-3',
  heroTitleBlock: 'min-w-0 flex-1',
  heroStatusChip: 'shrink-0 pt-0.5',
  heroMetaRow:
    'mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground',
  /** @deprecated use heroMetaRow */
  metaRow:
    'mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground',
  metaSeparator: 'text-muted-foreground/40 select-none',
  heroBadgeGrid: 'mt-3 grid grid-cols-2 gap-2',
  heroBadgeCell: 'min-w-0',
  heroBadgeChip: 'w-full min-h-8 justify-start px-2.5 text-[11px] leading-tight',
  heroActionGrid: 'mt-4 grid grid-cols-2 gap-2 border-t border-border/50 pt-4',
  heroActionFullRow: 'col-span-2',
  /** @deprecated use heroActionFullRow */
  heroActionFull: 'col-span-2',
  heroActionButton: 'w-full justify-center gap-1.5 min-h-9',
  decisionSectionGrid: 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6',
  decisionCardPrimary: 'h-full sm:col-span-2 xl:col-span-3',
  decisionCardSecondary: 'h-full sm:col-span-1 xl:col-span-1',
  decisionCardSecondaryWide: 'h-full sm:col-span-2 xl:col-span-1',
  /** @deprecated use decisionSectionGrid */
  sectionGrid: 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6',
  twoColGrid: 'grid grid-cols-1 gap-3 lg:grid-cols-2',
  summaryGrid: 'grid grid-cols-2 items-start gap-1 sm:gap-1.5 lg:grid-cols-3 xl:grid-cols-6',
  decisionCard: 'h-full',
  decisionCardBody: 'space-y-2.5 px-4 py-3.5',
  decisionCardTitleRow: 'inline-flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground',
  decisionCardIconBubble:
    'flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground',
  /** @deprecated use decisionCardIconBubble */
  decisionCardTitleIcon: 'size-3.5 shrink-0 text-muted-foreground',
  decisionCardAction:
    'inline-flex h-auto items-center gap-0.5 px-0 text-[11px] font-medium text-[color:var(--brand)]',
  /** @deprecated use decisionCardAction */
  decisionCardDetailsLink: 'h-auto px-0 text-[11px] font-medium',
  decisionChip: 'min-h-7 px-2.5 text-[12px] font-semibold',
  decisionChipRow: 'flex flex-wrap items-center gap-2',
  decisionChipStack: 'flex flex-col items-start gap-2',
  /** @deprecated use decisionChipStack */
  decisionCardChipStack: 'flex flex-col items-start gap-2',
  decisionDescription:
    'text-[11px] leading-snug text-[color:var(--status-critical)] line-clamp-2',
  decisionDescriptionWarning:
    'text-[11px] leading-snug text-[color:var(--status-attention)] line-clamp-2',
  /** @deprecated use decisionDescription */
  decisionCardReason:
    'text-[11px] leading-snug text-[color:var(--status-critical)] line-clamp-2',
  /** @deprecated use decisionDescriptionWarning */
  decisionCardReasonWarning:
    'text-[11px] leading-snug text-[color:var(--status-attention)] line-clamp-2',
  decisionMutedText: 'text-[11px] leading-snug text-muted-foreground',
  stageRail: 'mt-1 grid grid-cols-3 gap-1',
  stageRailItem: 'flex min-w-0 flex-col items-center gap-1.5',
  stageRailTrack: 'flex w-full items-center',
  stageRailDot: 'size-2 shrink-0 rounded-full ring-2 ring-card',
  stageRailLine: 'mx-1 h-px min-w-2 flex-1 bg-border/70',
  stageRailLabel: 'text-center text-[10px] leading-tight text-muted-foreground',
  /** @deprecated use stageRail */
  stageRow: 'flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground',
  /** @deprecated use stageRailItem */
  stageItem: 'inline-flex items-center gap-1',
  /** @deprecated use stageRailLabel */
  stageSeparator: 'text-muted-foreground/35 select-none',
  bottomTabBar:
    'sq-tab-bar sticky bottom-0 z-20 -mx-1 flex w-[calc(100%+0.5rem)] items-center p-1 sm:static sm:z-auto sm:mx-0 sm:w-full',
  bottomTabScroll:
    'flex min-w-0 flex-1 flex-nowrap gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  bottomTabButton:
    'min-h-8 min-w-0 shrink-0 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-[11px] font-semibold leading-[16px] tracking-[-0.003em] whitespace-nowrap transition-all duration-200',
  bottomTabButtonActive: 'bg-card text-foreground shadow-[var(--shadow-1)]',
  bottomTabButtonIdle:
    'text-muted-foreground hover:bg-background/60 hover:text-foreground',
  overviewActivityBody: 'py-3',
  documentsSection: 'space-y-4',
  documentsStatusGrid: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
  documentsStatusCard: 'rounded-lg border border-border bg-muted/15 p-3.5 space-y-2',
  documentsStatusHeader: 'flex items-start justify-between gap-2',
  documentsStatusTitle: 'text-[13px] font-semibold text-foreground',
  documentsStatusMeta: 'text-[11px] leading-snug text-muted-foreground',
  documentsStatusActions: 'flex flex-wrap gap-1.5 pt-1',
  documentsUploadSection: 'sq-card p-4 space-y-3',
  documentsUploadGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2',
  documentsEmptySuccess: 'text-[12px] text-muted-foreground',
  /** @deprecated use heroBadgeGrid */
  badgeRow: 'mt-2.5 flex flex-wrap items-center gap-1.5',
  /** @deprecated use heroActionGrid */
  actionsRow: 'mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3',
} as const;

/** Layout tokens for CustomerDetailModal (New Booking wizard preview only). */
export const cdm = {
  modal: 'sq-overlay flex max-h-[min(92vh,100dvh)] w-full max-w-[calc(100%-1rem)] flex-col overflow-hidden sm:max-w-3xl lg:max-w-4xl',
  header: 'sticky top-0 z-10 shrink-0 border-b border-border/60 bg-card/95 backdrop-blur-sm px-4 py-3 sm:px-5',
  body: 'flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-5 sm:py-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
  sectionGrid: 'grid grid-cols-1 gap-3 lg:grid-cols-2',
  summaryGrid: 'grid grid-cols-2 items-start gap-1 sm:gap-1.5 lg:grid-cols-4',
  identityCard: 'sq-card flex gap-3 p-3 sm:p-3.5',
  avatar:
    'flex size-11 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold uppercase tracking-tight',
  badgeRow: 'flex flex-wrap items-center gap-1.5',
} as const;

export function customerDetailTitleClass(): string {
  return 'text-[17px] font-bold leading-snug tracking-[-0.02em] text-foreground break-words sm:text-[18px]';
}

/** User-facing eligibility load failure — technical detail stays in title attribute. */
export const ELIGIBILITY_LOAD_ERROR_USER = 'Mietfreigabe konnte nicht geladen werden.';

export function customerStatusTone(status: CustomerUiStatus | string): StatusTone {
  switch (status) {
    case 'Active':
      return 'success';
    case 'Under Review':
      return 'watch';
    case 'Suspended':
    case 'Blocked':
      return 'critical';
    case 'Archived':
    case 'Inactive':
      return 'noData';
    default:
      return 'neutral';
  }
}

export function customerRiskTone(risk: CustomerUiRisk | string): StatusTone {
  switch (risk) {
    case 'Low Risk':
      return 'success';
    case 'Medium Risk':
      return 'warning';
    case 'High Risk':
      return 'critical';
    default:
      return 'noData';
  }
}

/** Header-only risk label — shorter copy for the hero badge grid. */
export function customerRiskHeaderLabelDe(risk: CustomerUiRisk | string): string {
  if (risk === 'Not Assessed') return 'Keine Bewertung';
  return customerRiskUiLabelDe(risk);
}

/** Header-only risk tone — neutral for unassessed customers. */
export function customerRiskHeaderTone(risk: CustomerUiRisk | string): StatusTone {
  if (risk === 'Not Assessed') return 'neutral';
  return customerRiskTone(risk);
}

export function customerVerificationTone(ui: CustomerUiVerification | string): StatusTone {
  if (ui === 'Verified') return 'success';
  if (ui === 'Pending Review') return 'warning';
  if (ui === 'Rejected' || ui === 'Expired') return 'critical';
  return 'neutral';
}

export type CustomerStatusAction = {
  label: string;
  nextStatus: CustomerUiStatus;
  variant: 'destructive' | 'warning' | 'success';
};

export function resolveCustomerStatusAction(
  status: CustomerUiStatus,
): CustomerStatusAction | null {
  switch (status) {
    case 'Active':
      return { label: 'Suspendieren', nextStatus: 'Suspended', variant: 'destructive' };
    case 'Suspended':
    case 'Blocked':
    case 'Inactive':
    case 'Archived':
      return { label: 'Reaktivieren', nextStatus: 'Active', variant: 'success' };
    case 'Under Review':
      return { label: 'Review abschließen', nextStatus: 'Active', variant: 'warning' };
    default:
      return null;
  }
}
