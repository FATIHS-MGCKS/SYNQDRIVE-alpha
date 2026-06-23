import type { VehicleOverviewSummary } from '../../lib/vehicle-overview.types';
import { vo } from './vehicle-overview-ui';

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
  if (summary.isLoading || !hasSyncedOverviewData(summary)) return null;

  const hints: string[] = [];

  if (summary.location.lastSignal) {
    hints.push(summary.location.lastSignal);
  } else if (summary.location.displayState) {
    hints.push(`State · ${summary.location.displayState}`);
  }

  const syncedCount = Object.values(summary.cards).filter((c) => c.loadState === 'ready').length;
  if (syncedCount > 0) {
    hints.push(
      syncedCount === 5
        ? 'All overview areas synced'
        : `${syncedCount} overview area${syncedCount === 1 ? '' : 's'} synced`,
    );
  }

  if (hints.length === 0) return null;

  return (
    <p className={vo.freshnessHint} role="note" aria-live="polite">
      {hints.join(' · ')}
    </p>
  );
}
