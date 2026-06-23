import type { ReactNode } from 'react';
import { StatusChip, type StatusTone } from '../../../components/patterns';
import type { RentalRuleSource } from '../settings/rental-rules/rental-rules.types';
import type { BookingRentalEligibilityStatus } from '../../lib/booking-rental-eligibility.types';
import type { VehicleRequirementsStatusKind } from '../../lib/vehicle-rental-requirements.utils';
import { labelRuleSource } from '../settings/rental-rules/rental-rules.utils';

export type RentalRequirementsBadgeKind =
  | VehicleRequirementsStatusKind
  | 'eligible'
  | 'not-eligible'
  | 'missing-information'
  | 'approval-required';

const BADGE_META: Record<
  RentalRequirementsBadgeKind,
  { label: string; tone: StatusTone; title?: string }
> = {
  active: { label: 'Active', tone: 'success', title: 'Rental rules are active for this vehicle' },
  'missing-category': {
    label: 'Missing category',
    tone: 'watch',
    title: 'Assign a vehicle category to apply shared rules',
  },
  'vehicle-override': {
    label: 'Override',
    tone: 'info',
    title: 'This vehicle has requirement overrides',
  },
  'manual-approval': {
    label: 'Manual approval',
    tone: 'warning',
    title: 'Bookings may require operator approval',
  },
  incomplete: {
    label: 'Incomplete',
    tone: 'watch',
    title: 'Organization defaults or category rules are not fully configured',
  },
  loading: { label: 'Loading', tone: 'neutral' },
  error: { label: 'Unavailable', tone: 'critical' },
  eligible: {
    label: 'Eligible',
    tone: 'success',
    title: 'Customer meets vehicle requirements',
  },
  'not-eligible': {
    label: 'Not eligible',
    tone: 'critical',
    title: 'Customer does not meet vehicle requirements',
  },
  'missing-information': {
    label: 'Missing information',
    tone: 'watch',
    title: 'Complete customer data to finish the check',
  },
  'approval-required': {
    label: 'Approval required',
    tone: 'warning',
    title: 'Manual operator approval is required',
  },
};

export function rentalEligibilityBadgeKind(
  status: BookingRentalEligibilityStatus,
): RentalRequirementsBadgeKind {
  switch (status) {
    case 'ELIGIBLE':
      return 'eligible';
    case 'NOT_ELIGIBLE':
      return 'not-eligible';
    case 'MISSING_INFORMATION':
      return 'missing-information';
    case 'MANUAL_APPROVAL_REQUIRED':
      return 'approval-required';
    default:
      return 'incomplete';
  }
}

export function RentalRequirementsStatusBadge({
  kind,
  className,
}: {
  kind: RentalRequirementsBadgeKind;
  className?: string;
}) {
  const meta = BADGE_META[kind];
  return (
    <StatusChip tone={meta.tone} dot title={meta.title} className={className}>
      {meta.label}
    </StatusChip>
  );
}

export function RentalRuleSourceBadge({
  source,
  sourceName,
  className,
}: {
  source: RentalRuleSource | null | undefined;
  sourceName?: string | null;
  className?: string;
}) {
  const label = labelRuleSource(source ?? null, sourceName ?? null);
  const tone: StatusTone =
    source === 'VEHICLE_OVERRIDE'
      ? 'info'
      : source === 'CATEGORY'
        ? 'neutral'
        : source === 'ORGANIZATION_DEFAULT'
          ? 'neutral'
          : 'neutral';

  return (
    <StatusChip tone={tone} className={className} title={`Rule source: ${label}`}>
      {label}
    </StatusChip>
  );
}

export function RuleValueTile({
  label,
  value,
  source,
  sourceName,
  highlighted,
  className,
}: {
  label: string;
  value: string;
  source?: RentalRuleSource | null;
  sourceName?: string | null;
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/60 bg-card/80 px-3.5 py-3 transition-colors hover:bg-muted/15 ${
        highlighted ? 'border-l-[3px] border-l-[color:var(--brand)]/45' : ''
      } ${className ?? ''}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[17px] font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {(source || sourceName) && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {labelRuleSource(source ?? null, sourceName ?? null)}
        </p>
      )}
    </div>
  );
}

export function EffectiveRulesListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading effective rules">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3 animate-pulse motion-reduce:animate-none"
        >
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 rounded bg-muted/80" />
            <div className="h-2.5 w-40 rounded bg-muted/50" />
          </div>
          <div className="h-4 w-16 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

export function RentalRulesSectionIntro({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
        {description ? (
          <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export const rentalFormSectionClass = 'space-y-4 rounded-xl border border-border/60 bg-muted/10 p-4';
export const rentalFormSectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
