import type { StatusTone } from '../../../components/patterns';
import type {
  CustomerUiRisk,
  CustomerUiStatus,
  CustomerUiVerification,
} from '../../lib/entityMappers';

/** Layout tokens for the full CustomerDetailView page. */
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
