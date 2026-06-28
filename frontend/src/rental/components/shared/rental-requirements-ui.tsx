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
  { label: string; labelDe?: string; tone: StatusTone; title?: string; titleDe?: string }
> = {
  active: {
    label: 'Active',
    labelDe: 'Regeln aktiv',
    tone: 'success',
    title: 'Rental rules are active for this vehicle',
    titleDe: 'Mietregeln sind für dieses Fahrzeug aktiv',
  },
  'missing-category': {
    label: 'Missing category',
    labelDe: 'Kategorie fehlt',
    tone: 'watch',
    title: 'Assign a vehicle category to apply shared rules',
    titleDe: 'Weise eine Fahrzeugkategorie zu, um Gruppenregeln anzuwenden',
  },
  'vehicle-override': {
    label: 'Override',
    labelDe: 'Fahrzeug-Override',
    tone: 'info',
    title: 'This vehicle has requirement overrides',
    titleDe: 'Dieses Fahrzeug hat eigene Anforderungs-Overrides',
  },
  'manual-approval': {
    label: 'Manual approval',
    labelDe: 'Manuelle Freigabe',
    tone: 'warning',
    title: 'Bookings may require operator approval',
    titleDe: 'Buchungen können eine manuelle Freigabe erfordern',
  },
  incomplete: {
    label: 'Incomplete',
    labelDe: 'Unvollständig',
    tone: 'watch',
    title: 'Organization defaults or category rules are not fully configured',
    titleDe: 'Organisations- oder Kategorieregeln sind nicht vollständig konfiguriert',
  },
  loading: { label: 'Loading', labelDe: 'Lädt', tone: 'neutral' },
  error: {
    label: 'Unavailable',
    labelDe: 'Nicht verfügbar',
    tone: 'critical',
  },
  eligible: {
    label: 'Eligible',
    labelDe: 'Geeignet',
    tone: 'success',
    title: 'Customer meets vehicle requirements',
    titleDe: 'Kunde erfüllt die Fahrzeuganforderungen',
  },
  'not-eligible': {
    label: 'Not eligible',
    labelDe: 'Nicht geeignet',
    tone: 'critical',
    title: 'Customer does not meet vehicle requirements',
    titleDe: 'Kunde erfüllt die Fahrzeuganforderungen nicht',
  },
  'missing-information': {
    label: 'Missing information',
    labelDe: 'Fehlende Angaben',
    tone: 'watch',
    title: 'Complete customer data to finish the check',
    titleDe: 'Vervollständige Kundendaten für die Prüfung',
  },
  'approval-required': {
    label: 'Approval required',
    labelDe: 'Freigabe nötig',
    tone: 'warning',
    title: 'Manual operator approval is required',
    titleDe: 'Manuelle Operator-Freigabe erforderlich',
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
  locale = 'en',
}: {
  kind: RentalRequirementsBadgeKind;
  className?: string;
  locale?: 'en' | 'de';
}) {
  const meta = BADGE_META[kind];
  const label = locale === 'de' && meta.labelDe ? meta.labelDe : meta.label;
  const title = locale === 'de' && meta.titleDe ? meta.titleDe : meta.title;
  return (
    <StatusChip tone={meta.tone} dot title={title} className={className}>
      {label}
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

export const REQUIREMENT_FIELD_LABEL_DE: Record<string, string> = {
  minimumAgeYears: 'Mindestalter',
  minimumLicenseHoldingYears: 'Führerscheinbesitz',
  depositAmount: 'Kaution',
  creditCardRequired: 'Kreditkarte erforderlich',
  foreignTravelPolicy: 'Auslandsfahrt',
  additionalDriverPolicy: 'Zusatzfahrer',
  youngDriverPolicy: 'Junge Fahrer',
  insuranceRequirement: 'Versicherung',
  manualApprovalRequired: 'Manuelle Freigabe',
  notes: 'Notizen',
};

export function requirementFieldLabelDe(key: string, fallback: string): string {
  return REQUIREMENT_FIELD_LABEL_DE[key] ?? fallback;
}

const REQUIREMENT_VALUE_DE: Record<string, string> = {
  Yes: 'Ja',
  No: 'Nein',
  Allowed: 'Erlaubt',
  'Not allowed': 'Nicht erlaubt',
  'Approval required': 'Freigabe nötig',
  'Fee required': 'Gebühr nötig',
};

export function requirementValueDisplayDe(value: string): string {
  if (!value || value === '—') return '—';
  return REQUIREMENT_VALUE_DE[value] ?? value.replace(/\byr\b/g, 'Jahre').replace(/\byears\b/g, 'Jahre').replace(/\b1 year\b/g, '1 Jahr');
}

export function ruleSourceLabelDe(
  source: RentalRuleSource | null | undefined,
  sourceName: string | null | undefined,
): string {
  if (!source) return 'Nicht gesetzt';
  if (source === 'ORGANIZATION_DEFAULT') return 'Organisationsstandard';
  if (source === 'CATEGORY' && sourceName) return `Kategorie: ${sourceName}`;
  if (source === 'CATEGORY') return 'Fahrzeugkategorie';
  if (source === 'VEHICLE_OVERRIDE') return 'Fahrzeug-Override';
  return labelRuleSource(source, sourceName ?? null);
}

function isNumericRequirementValue(value: string): boolean {
  if (value === '—' || !value.trim()) return false;
  return /^[\d€$.,\s%]+|^\d+\s*(Jahre|Jahr|yr|years|mo|months)/i.test(value);
}

export function RuleValueTile({
  label,
  value,
  source,
  sourceName,
  highlighted,
  className,
  density = 'compact',
  locale = 'en',
  fieldKey,
}: {
  label: string;
  value: string;
  source?: RentalRuleSource | null;
  sourceName?: string | null;
  highlighted?: boolean;
  className?: string;
  density?: 'default' | 'compact' | 'mini';
  locale?: 'en' | 'de';
  fieldKey?: string;
}) {
  const displayValue = locale === 'de' ? requirementValueDisplayDe(value) : value;
  const displayLabel =
    locale === 'de' && fieldKey
      ? requirementFieldLabelDe(fieldKey, label)
      : label;
  const isEmpty = displayValue === '—' || !displayValue.trim();
  const isNumeric = !isEmpty && isNumericRequirementValue(displayValue);
  const sourceLabel =
    locale === 'de'
      ? ruleSourceLabelDe(source, sourceName)
      : labelRuleSource(source ?? null, sourceName ?? null);

  const padding =
    density === 'mini' ? 'px-2.5 py-2' : density === 'compact' ? 'px-3 py-2.5' : 'px-3.5 py-3';
  const labelClass =
    density === 'mini'
      ? 'text-[11px] font-semibold text-muted-foreground'
      : 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  const valueClass = isEmpty
    ? 'text-[12px] font-medium text-muted-foreground'
    : density === 'mini'
      ? isNumeric
        ? 'text-[14px] font-semibold leading-[1.2] tabular-nums text-foreground sm:text-[15px]'
        : 'text-[13px] font-semibold leading-[1.25] text-foreground sm:text-[14px]'
      : density === 'compact'
        ? isNumeric
          ? 'text-[16px] font-semibold leading-[1.2] tabular-nums text-foreground sm:text-[17px] lg:text-[18px]'
          : 'text-[15px] font-semibold leading-[1.25] text-foreground sm:text-[16px] lg:text-[18px]'
        : 'text-[17px] font-semibold tabular-nums tracking-tight text-foreground';

  return (
    <div
      className={`rounded-lg border border-border/60 bg-card/80 ${padding} transition-colors hover:bg-muted/10 ${
        highlighted ? 'border-l-[3px] border-l-[color:var(--brand)]/45' : ''
      } ${className ?? ''}`}
    >
      <p className={`mt-0.5 ${labelClass}`}>
        {displayLabel}
      </p>
      <p className={`mt-1 ${valueClass}`}>{displayValue}</p>
      {(source || sourceName) && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{sourceLabel}</p>
      )}
    </div>
  );
}

export function EffectiveRequirementsSummaryGrid({
  rows,
  locale = 'de',
}: {
  rows: Array<{ key: string; label: string; value: string }>;
  locale?: 'en' | 'de';
}) {
  const keys = [
    'minimumAgeYears',
    'minimumLicenseHoldingYears',
    'depositAmount',
    'creditCardRequired',
  ] as const;
  const summaryItems = keys
    .map((key) => rows.find((r) => r.key === key))
    .filter((r): r is { key: string; label: string; value: string } => Boolean(r));

  if (summaryItems.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
      {summaryItems.map((item) => {
        const displayValue =
          locale === 'de' ? requirementValueDisplayDe(item.value) : item.value;
        const displayLabel =
          locale === 'de'
            ? requirementFieldLabelDe(item.key, item.label)
            : item.label;
        const isEmpty = displayValue === '—';
        return (
          <div
            key={item.key}
            className="rounded-lg border border-border/50 bg-muted/15 px-2.5 py-2 sm:px-3 sm:py-2.5"
          >
            <p className="text-[11px] font-medium text-muted-foreground">{displayLabel}</p>
            <p
              className={`mt-0.5 text-[15px] font-semibold leading-[1.2] sm:text-[16px] lg:text-[18px] ${
                isEmpty ? 'text-muted-foreground' : 'text-foreground'
              } ${!isEmpty && isNumericRequirementValue(displayValue) ? 'tabular-nums' : ''}`}
            >
              {displayValue}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function RuleInheritanceSteps({
  steps,
  activeStep,
  rulesActive,
  locale = 'de',
}: {
  steps: readonly { key: string; label: string; labelDe: string }[];
  activeStep: string;
  rulesActive?: boolean;
  locale?: 'en' | 'de';
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {locale === 'de' ? 'Regelherkunft' : 'Rule inheritance'}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((step, index) => {
          const isActive =
            step.key === activeStep || (step.key === 'effective' && rulesActive);
          const label = locale === 'de' ? step.labelDe : step.label;
          return (
            <div key={step.key} className="flex items-center gap-1.5">
              <span
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold sm:text-[11px] ${
                  isActive
                    ? 'border-[color:var(--brand)]/30 bg-[color:var(--brand)]/8 text-foreground'
                    : 'border-border/60 bg-background/50 text-muted-foreground'
                }`}
              >
                {label}
              </span>
              {index < steps.length - 1 && (
                <span className="text-[10px] text-muted-foreground/70" aria-hidden>
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>
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
