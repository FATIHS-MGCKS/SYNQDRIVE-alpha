import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type {
  ActionQueueCategory,
  ActionQueueCta,
  ActionQueueSeverity,
} from './dashboardTypes';
import type { VehicleTelemetryFreshness } from './controlSignalsBuilder';

export type InsightDataSource =
  | 'dashboard-insights'
  | 'derived-operations'
  | 'financial'
  | 'booking';

export interface DerivedOperationalInsight {
  id: string;
  source: InsightDataSource;
  severity: ActionQueueSeverity;
  category: ActionQueueCategory;
  title: string;
  reason: string;
  entityLabel?: string;
  timeLabel?: string;
  timeSortMs: number;
  cta: ActionQueueCta;
  vehicleId?: string;
  bookingId?: string;
  isOverdue: boolean;
}

/**
 * Fleet-level operational signals not covered by per-entity predictive risks.
 * Per-booking / per-vehicle risks live in `derivePredictiveOperationsInsights`.
 */
export function deriveOperationalInsights(input: {
  locale: string;
  vehicles: VehicleData[];
  fleetById: Map<string, VehicleData>;
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  healthAlerts: VehicleHealthAlert[];
  healthMap: Map<string, VehicleHealthResponse>;
  telemetry: VehicleTelemetryFreshness;
  fleetLoading: boolean;
  todayBookingsLoaded: boolean;
}): DerivedOperationalInsight[] {
  const de = input.locale === 'de';
  const items: DerivedOperationalInsight[] = [];
  const now = Date.now();

  if (!input.todayBookingsLoaded || input.fleetLoading) return items;

  const pendingPickups = input.pickupItems.filter((p) => !p.done && p.bookingId);
  const pendingReturns = input.returnItems.filter((r) => !r.done && r.bookingId);

  const staleTotal = input.telemetry.staleCount + input.telemetry.offlineCount;
  if (
    input.telemetry.hasReliableTimestamps &&
    input.vehicles.length >= 3 &&
    staleTotal >= 3 &&
    staleTotal > input.telemetry.freshCount
  ) {
    items.push({
      id: 'derived-fleet-stale-telemetry',
      source: 'derived-operations',
      severity: staleTotal > input.telemetry.freshCount * 2 ? 'warning' : 'attention',
      category: 'operations',
      title: de ? `Viele Fahrzeuge mit stale/offline Daten` : `Many vehicles with stale/offline data`,
      reason: de
        ? `${staleTotal} von ${input.telemetry.totalInScope} Fahrzeugen ohne frische Telemetrie`
        : `${staleTotal} of ${input.telemetry.totalInScope} vehicles lack fresh telemetry`,
      timeSortMs: now,
      cta: 'open-rental',
      isOverdue: false,
    });
  }

  const overdueHandovers =
    pendingPickups.filter((p) => p.isOverdue).length +
    pendingReturns.filter((r) => r.isOverdue).length;
  if (overdueHandovers >= 3) {
    items.push({
      id: 'derived-handover-backlog',
      source: 'derived-operations',
      severity: 'critical',
      category: 'handover',
      title: de ? `Offene Handovers blockieren Betrieb` : `Open handovers blocking operations`,
      reason: de
        ? `${overdueHandovers} überfällige Übergaben im Scope`
        : `${overdueHandovers} overdue handovers in scope`,
      timeSortMs: now,
      cta: 'open-rental',
      isOverdue: true,
    });
  }

  return items;
}
