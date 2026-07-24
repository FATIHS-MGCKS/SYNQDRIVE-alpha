import type { VehicleOverviewSummary } from '../../lib/vehicle-overview.types';
import { vo } from './vehicle-overview-ui';
import { useLanguage } from '../../i18n/LanguageContext';
import { translateVehicleDisplayStateLabel } from '../../lib/vehicle-detail-i18n';

function hasSyncedOverviewData(summary: VehicleOverviewSummary): boolean {
  if (summary.health.loadState === 'ready') return true;
  return Object.values(summary.cards).some((card) => card.loadState === 'ready');
}

export interface VehicleOverviewFreshnessHintProps {
  summary: VehicleOverviewSummary;
}

/**
 * Subtle footer — only when at least one overview data source has loaded successfully.
 */
export function VehicleOverviewFreshnessHint({ summary }: VehicleOverviewFreshnessHintProps) {
  const { t } = useLanguage();
  if (summary.isLoading || !hasSyncedOverviewData(summary)) return null;

  const hints: string[] = [];

  if (summary.location.lastSignal) {
    hints.push(summary.location.lastSignal);
  } else if (summary.location.displayState) {
    hints.push(
      `${t('vehicleDetail.overview.statePrefix')} · ${translateVehicleDisplayStateLabel(summary.location.displayState, t)}`,
    );
  }

  const syncedCount = Object.values(summary.cards).filter((c) => c.loadState === 'ready').length;
  if (syncedCount > 0) {
    hints.push(
      syncedCount === 5
        ? t('vehicleDetail.overview.allSynced')
        : syncedCount === 1
          ? t('vehicleDetail.overview.oneAreaSynced')
          : t('vehicleDetail.overview.areasSynced', { count: syncedCount }),
    );
  }

  if (hints.length === 0) return null;

  return (
    <p className={vo.freshnessHint} role="note" aria-live="polite">
      {hints.join(' · ')}
    </p>
  );
}
