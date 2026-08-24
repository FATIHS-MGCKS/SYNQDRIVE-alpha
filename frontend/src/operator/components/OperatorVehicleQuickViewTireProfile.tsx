import type { TireHealthSummaryResponse } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { SkeletonRows } from '../../components/patterns';
import {
  operatorVehicleQuickViewTireProfileEmptyLabel,
  operatorVehicleQuickViewTireProfileLabel,
  operatorVehicleQuickViewTireProfileLastMeasurementLabel,
  operatorVehicleQuickViewTireProfileMeasureActionLabel,
  operatorVehicleQuickViewTireProfileMinTreadLabel,
  operatorVehicleQuickViewTireProfileModeLabel,
  operatorVehicleQuickViewTireProfileRemainingLabel,
  operatorVehicleQuickViewTireProfileSectionTitle,
  operatorVehicleQuickViewTireProfileStatusLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorGlassCard } from './OperatorGlassCard';

export interface OperatorVehicleQuickViewTireProfileProps {
  tireSummary: TireHealthSummaryResponse | null;
  tireLoading: boolean;
  onMeasure: () => void;
}

export function OperatorVehicleQuickViewTireProfile({
  tireSummary,
  tireLoading,
  onMeasure,
}: OperatorVehicleQuickViewTireProfileProps) {
  const { locale } = useLanguage();

  return (
    <OperatorGlassCard className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {operatorVehicleQuickViewTireProfileSectionTitle(locale)}
        </h3>
        <button
          type="button"
          onClick={() => onMeasure()}
          className="text-xs font-semibold text-[color:var(--brand-ink)]"
        >
          {operatorVehicleQuickViewTireProfileMeasureActionLabel(locale)}
        </button>
      </div>
      {tireLoading ? (
        <SkeletonRows rows={1} />
      ) : !tireSummary ? (
        <p className="text-sm text-muted-foreground">
          {operatorVehicleQuickViewTireProfileEmptyLabel(locale)}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoTile
            label={operatorVehicleQuickViewTireProfileLabel(locale, 'lastMeasurement')}
            value={operatorVehicleQuickViewTireProfileLastMeasurementLabel(locale, tireSummary)}
          />
          <InfoTile
            label={operatorVehicleQuickViewTireProfileLabel(locale, 'minTread')}
            value={operatorVehicleQuickViewTireProfileMinTreadLabel(locale, tireSummary)}
          />
          <InfoTile
            label={operatorVehicleQuickViewTireProfileLabel(locale, 'status')}
            value={operatorVehicleQuickViewTireProfileStatusLabel(locale, tireSummary)}
          />
          <InfoTile
            label={operatorVehicleQuickViewTireProfileLabel(locale, 'remaining')}
            value={operatorVehicleQuickViewTireProfileRemainingLabel(locale, tireSummary)}
          />
          <InfoTile
            label={operatorVehicleQuickViewTireProfileLabel(locale, 'mode')}
            value={operatorVehicleQuickViewTireProfileModeLabel(locale, tireSummary)}
          />
        </div>
      )}
    </OperatorGlassCard>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}
