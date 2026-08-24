import type { DamageResponse } from '../../rental/lib/damage.types';
import { useLanguage } from '../../i18n/LanguageContext';
import { SkeletonRows, StatusChip } from '../../components/patterns';
import {
  operatorVehicleQuickViewActiveDamagesEmptyLabel,
  operatorVehicleQuickViewActiveDamagesImpactLabel,
  operatorVehicleQuickViewActiveDamagesRowTitle,
  operatorVehicleQuickViewActiveDamagesSectionTitle,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorGlassCard } from './OperatorGlassCard';

export interface OperatorVehicleQuickViewActiveDamagesProps {
  damages: DamageResponse[];
  damagesLoading: boolean;
}

export function OperatorVehicleQuickViewActiveDamages({
  damages,
  damagesLoading,
}: OperatorVehicleQuickViewActiveDamagesProps) {
  const { locale } = useLanguage();

  return (
    <OperatorGlassCard className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {operatorVehicleQuickViewActiveDamagesSectionTitle(locale)}
        </h3>
      </div>
      {damagesLoading ? (
        <SkeletonRows rows={2} />
      ) : damages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {operatorVehicleQuickViewActiveDamagesEmptyLabel(locale)}
        </p>
      ) : (
        <div className="space-y-2">
          {damages.slice(0, 5).map((damage) => (
            <div key={damage.id} className="rounded-xl border border-border/50 px-3 py-2">
              <p className="text-sm font-semibold">
                {operatorVehicleQuickViewActiveDamagesRowTitle(locale, damage)}
              </p>
              {damage.locationLabel && (
                <p className="text-xs text-muted-foreground">{damage.locationLabel}</p>
              )}
              {damage.rentalImpact && damage.rentalImpact !== 'NONE' && (
                <StatusChip tone="watch" className="mt-1">
                  {operatorVehicleQuickViewActiveDamagesImpactLabel(locale, damage.rentalImpact)}
                </StatusChip>
              )}
            </div>
          ))}
        </div>
      )}
    </OperatorGlassCard>
  );
}
