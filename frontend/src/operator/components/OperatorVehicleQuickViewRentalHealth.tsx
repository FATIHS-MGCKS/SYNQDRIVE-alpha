import type { VehicleHealthResponse } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { SkeletonRows, StatusChip } from '../../components/patterns';
import {
  operatorVehicleQuickViewRentalHealthEmptyLabel,
  operatorVehicleQuickViewRentalHealthModuleLabel,
  operatorVehicleQuickViewRentalHealthModulePresentation,
  operatorVehicleQuickViewRentalHealthSectionTitle,
  operatorVehicleQuickViewRentalHealthStaleSuffix,
  RENTAL_HEALTH_MODULE_KEYS,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorGlassCard } from './OperatorGlassCard';

export interface OperatorVehicleQuickViewRentalHealthProps {
  health: VehicleHealthResponse | null;
  healthLoading: boolean;
}

export function OperatorVehicleQuickViewRentalHealth({
  health,
  healthLoading,
}: OperatorVehicleQuickViewRentalHealthProps) {
  const { locale } = useLanguage();

  return (
    <OperatorGlassCard className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {operatorVehicleQuickViewRentalHealthSectionTitle(locale)}
        </h3>
      </div>
      {healthLoading ? (
        <SkeletonRows rows={4} />
      ) : !health ? (
        <p className="text-sm text-muted-foreground">
          {operatorVehicleQuickViewRentalHealthEmptyLabel(locale)}
        </p>
      ) : (
        <div className="space-y-2">
          {RENTAL_HEALTH_MODULE_KEYS.map((key) => {
            const mod = health.modules[key];
            const row = operatorVehicleQuickViewRentalHealthModulePresentation(locale, mod);
            return (
              <div
                key={key}
                className="flex items-start justify-between gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {operatorVehicleQuickViewRentalHealthModuleLabel(locale, key)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{row.reason}</p>
                </div>
                <StatusChip tone={row.tone} className="shrink-0">
                  {row.stateLabel}
                  {row.stale ? operatorVehicleQuickViewRentalHealthStaleSuffix(locale) : ''}
                </StatusChip>
              </div>
            );
          })}
        </div>
      )}
    </OperatorGlassCard>
  );
}
