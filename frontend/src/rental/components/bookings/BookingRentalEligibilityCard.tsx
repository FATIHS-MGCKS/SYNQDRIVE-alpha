import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import type { BookingRentalEligibilityResult } from '../../lib/booking-rental-eligibility.types';
import {
  rentalEligibilityBadgeKind,
  RentalRequirementsStatusBadge,
} from '../shared/rental-requirements-ui';
import { labelRuleSource } from '../settings/rental-rules/rental-rules.utils';

const MISSING_FIELD_LABELS: Record<string, string> = {
  'customer.dateOfBirth': 'Geburtsdatum',
  'customer.licenseIssuedAt': 'Führerschein-Ausstellungsdatum',
};

function statusTitle(status: BookingRentalEligibilityResult['status']): string {
  switch (status) {
    case 'ELIGIBLE':
      return 'Fahrzeugvoraussetzungen erfüllt';
    case 'MANUAL_APPROVAL_REQUIRED':
      return 'Manuelle Freigabe nötig';
    case 'NOT_ELIGIBLE':
      return 'Nicht berechtigt';
    case 'MISSING_INFORMATION':
      return 'Fehlende Kundendaten';
    default:
      return 'Prüfung läuft';
  }
}

function EligibilitySkeleton() {
  return (
    <div
      className="rounded-xl border border-border/60 surface-premium p-4 space-y-3"
      aria-busy="true"
      aria-label="Fahrzeugvoraussetzungen werden geprüft"
    >
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
        <div className="h-3.5 w-40 rounded bg-muted/80 animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="h-3 w-full max-w-[220px] rounded bg-muted/50 animate-pulse motion-reduce:animate-none" />
      <div className="h-3 w-3/4 rounded bg-muted/40 animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

export interface BookingRentalEligibilityCardProps {
  result: BookingRentalEligibilityResult | null;
  loading?: boolean;
  error?: string | null;
  onCompleteCustomerData?: () => void;
  onChooseAnotherVehicle?: () => void;
}

export function BookingRentalEligibilityCard({
  result,
  loading,
  error,
  onCompleteCustomerData,
  onChooseAnotherVehicle,
}: BookingRentalEligibilityCardProps) {
  if (loading) return <EligibilitySkeleton />;

  if (error) {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs"
        role="alert"
      >
        <p className="font-semibold text-foreground">Voraussetzungsprüfung nicht verfügbar</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const minAge = result.effectiveRules.minimumAgeYears.value;
  const sourceLabel = labelRuleSource(
    result.effectiveRules.minimumAgeYears.source,
    result.effectiveRules.minimumAgeYears.sourceName,
  );

  return (
    <div className="rounded-xl border border-border/60 surface-premium p-4 text-xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon name="shield-check" className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{statusTitle(result.status)}</p>
            {minAge != null && (
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                Mindestalter {minAge} · {sourceLabel}
              </p>
            )}
          </div>
        </div>
        <RentalRequirementsStatusBadge kind={rentalEligibilityBadgeKind(result.status)} />
      </div>

      {result.missingFields.length > 0 && (
        <div className="rounded-lg bg-muted/20 px-3 py-2 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Fehlende Angaben
          </p>
          {result.missingFields.map((field) => (
            <p key={field} className="text-muted-foreground flex items-center gap-1.5">
              <Icon name="circle" className="w-1.5 h-1.5 shrink-0" aria-hidden />
              {MISSING_FIELD_LABELS[field] ?? field}
            </p>
          ))}
        </div>
      )}

      {(result.blockingReasons.length > 0 || result.manualApprovalReasons.length > 0) && (
        <div className="space-y-1">
          {result.blockingReasons.map((reason) => (
            <p key={reason} className="text-muted-foreground leading-relaxed flex gap-1.5">
              <Icon name="x-circle" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[color:var(--status-critical)]" aria-hidden />
              <span>{reason}</span>
            </p>
          ))}
          {result.manualApprovalReasons.map((reason) => (
            <p key={reason} className="text-muted-foreground leading-relaxed flex gap-1.5">
              <Icon name="alert-triangle" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[color:var(--status-watch)]" aria-hidden />
              <span>{reason}</span>
            </p>
          ))}
        </div>
      )}

      {result.warningReasons.slice(0, 2).map((reason) => (
        <p key={reason} className="text-muted-foreground leading-relaxed flex gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>{reason}</span>
        </p>
      ))}

      {result.warningReasons.some((reason) => /deposit|kaution/i.test(reason)) && (
        <p className="text-muted-foreground leading-relaxed flex gap-1.5">
          <Icon name="alert-triangle" className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[color:var(--status-watch)]" aria-hidden />
          <span>
            Der Führerschein muss beim Pickup zwingend manuell kontrolliert werden.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        {result.status === 'MISSING_INFORMATION' && onCompleteCustomerData && (
          <button
            type="button"
            onClick={onCompleteCustomerData}
            className="sq-btn sq-btn-secondary h-8 px-3 text-[11px]"
          >
            Kundendaten ergänzen
          </button>
        )}
        {result.status === 'NOT_ELIGIBLE' && onChooseAnotherVehicle && (
          <button
            type="button"
            onClick={onChooseAnotherVehicle}
            className="sq-btn sq-btn-secondary h-8 px-3 text-[11px]"
          >
            Anderes Fahrzeug wählen
          </button>
        )}
        {result.status === 'MANUAL_APPROVAL_REQUIRED' && (
          <StatusChip tone="neutral" className="self-center">
            Buchung kann als Ausstehend angelegt werden
          </StatusChip>
        )}
      </div>
    </div>
  );
}
