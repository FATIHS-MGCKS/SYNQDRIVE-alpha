import { Loader2, X } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import { resolveFleetVehicleDisplayState } from '../../rental/lib/fleetVehicleDisplay';
import { VehicleOperationalStatusCallout } from '../../rental/components/fleet/VehicleOperationalStatusCallout';
import {
  isOperationalStatusUnreliable,
  resolveUnreliableOperationalStatusDisplay,
} from '../../rental/lib/vehicle-operational-unknown-display';
import { useLanguage } from '../../i18n/LanguageContext';
import type { OperatorVehicleStatusSnapshot } from '../lib/operatorVehicleQuickView.utils';
import {
  operatorVehicleQuickViewHeaderCleaningPendingLabel,
  operatorVehicleQuickViewHeaderCloseAriaLabel,
  operatorVehicleQuickViewHeaderNotFound,
  operatorVehicleQuickViewHeaderReleaseQuestion,
  operatorVehicleQuickViewHeaderRentalHealthPrefix,
  operatorVehicleQuickViewPrimaryStatusLabel,
  operatorVehicleQuickViewReleaseLabel,
  operatorVehicleQuickViewRentalHealthStateLabel,
  resolveOperatorVehicleQuickViewOperationalDisplayLocale,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorGlassCard } from './OperatorGlassCard';

export interface OperatorVehicleQuickViewHeaderProps {
  vehicle: VehicleData | null;
  snapshot: OperatorVehicleStatusSnapshot | null;
  health: VehicleHealthResponse | null;
  healthLoading: boolean;
  onClose?: () => void;
  onReloadDetails: () => void;
}

function resolveHeaderPrimaryLabel(
  locale: string,
  vehicle: VehicleData,
  snapshot: OperatorVehicleStatusSnapshot,
): string {
  if (isOperationalStatusUnreliable(vehicle)) {
    const unreliableDisplay = resolveUnreliableOperationalStatusDisplay(vehicle, {
      locale: resolveOperatorVehicleQuickViewOperationalDisplayLocale(locale),
    });
    return (
      unreliableDisplay?.badgeLabel ??
      operatorVehicleQuickViewPrimaryStatusLabel(locale, snapshot.primaryStatus)
    );
  }
  return operatorVehicleQuickViewPrimaryStatusLabel(locale, snapshot.primaryStatus);
}

export function OperatorVehicleQuickViewHeaderNotFound() {
  const { locale } = useLanguage();
  return (
    <OperatorGlassCard className="p-4">
      <p className="text-sm text-muted-foreground">
        {operatorVehicleQuickViewHeaderNotFound(locale)}
      </p>
    </OperatorGlassCard>
  );
}

export function OperatorVehicleQuickViewHeader({
  vehicle,
  snapshot,
  health,
  healthLoading,
  onClose,
  onReloadDetails,
}: OperatorVehicleQuickViewHeaderProps) {
  const { locale } = useLanguage();

  if (!vehicle) {
    return <OperatorVehicleQuickViewHeaderNotFound />;
  }

  const operationalDisplayLocale = resolveOperatorVehicleQuickViewOperationalDisplayLocale(locale);
  const fleetDisplay = resolveFleetVehicleDisplayState(vehicle, {
    rentalHealth: health,
    locale: operationalDisplayLocale,
  });

  const primaryLabel =
    snapshot != null ? resolveHeaderPrimaryLabel(locale, vehicle, snapshot) : null;
  const releaseLabel =
    snapshot != null
      ? operatorVehicleQuickViewReleaseLabel(locale, snapshot.releaseDecision)
      : null;
  const releaseUnavailableLabel = operatorVehicleQuickViewReleaseLabel(locale, 'unavailable');

  return (
    <OperatorGlassCard className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-[color:var(--brand-soft)]/80 to-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-bold tracking-tight text-foreground">
              {vehicle.license || '—'}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{vehicle.model}</p>
            {vehicle.station && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{vehicle.station}</p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="sq-press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80"
              aria-label={operatorVehicleQuickViewHeaderCloseAriaLabel(locale)}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {snapshot && primaryLabel && (
            <StatusChip tone={snapshot.primaryTone} dot>
              {primaryLabel}
            </StatusChip>
          )}
          <StatusChip tone={fleetDisplay.statusBadge.tone}>
            {fleetDisplay.statusBadge.label}
          </StatusChip>
          {vehicle.cleaningStatus === 'Needs Cleaning' && (
            <StatusChip tone="watch">
              {operatorVehicleQuickViewHeaderCleaningPendingLabel(locale)}
            </StatusChip>
          )}
        </div>

        {fleetDisplay.statusBadge.showUnreliableCallout ? (
          <div className="mt-3">
            <VehicleOperationalStatusCallout
              vehicle={vehicle}
              statusBadge={fleetDisplay.statusBadge}
              locale={operationalDisplayLocale}
              onRefresh={onReloadDetails}
              compact
            />
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {operatorVehicleQuickViewHeaderReleaseQuestion(locale)}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            {healthLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : fleetDisplay.statusBadge.showUnreliableCallout ? (
              <span className="text-sm font-semibold text-muted-foreground">
                {releaseLabel ?? releaseUnavailableLabel}
              </span>
            ) : (
              <>
                <span
                  className={`text-xl font-bold ${
                    snapshot?.releaseTone === 'success'
                      ? 'text-[color:var(--status-success)]'
                      : snapshot?.releaseTone === 'critical'
                        ? 'text-[color:var(--status-critical)]'
                        : 'text-foreground'
                  }`}
                >
                  {releaseLabel ?? '—'}
                </span>
                {health?.overall_state && (
                  <span className="text-xs text-muted-foreground">
                    {operatorVehicleQuickViewHeaderRentalHealthPrefix(locale)}{' '}
                    {operatorVehicleQuickViewRentalHealthStateLabel(locale, health.overall_state)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </OperatorGlassCard>
  );
}
