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
import type { DashboardRuntimeModel } from './runtime';

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
  affectedVehicles?: Array<{ id: string; label: string }>;
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
  dashboardRuntime?: DashboardRuntimeModel;
  fleetLoading: boolean;
  todayBookingsLoaded: boolean;
  unassignedTariffVehicleCount?: number;
  unassignedTariffVehicles?: Array<{ id: string; label: string }>;
}): DerivedOperationalInsight[] {
  const de = input.locale === 'de';
  const items: DerivedOperationalInsight[] = [];
  const now = Date.now();

  if (!input.todayBookingsLoaded || input.fleetLoading) return items;

  if ((input.unassignedTariffVehicleCount ?? 0) > 0) {
    const vehicles = input.unassignedTariffVehicles ?? [];
    items.push({
      id: 'derived-vehicles-without-tariff',
      source: 'derived-operations',
      severity: 'critical',
      category: 'operations',
      title: de
        ? `${input.unassignedTariffVehicleCount} Fahrzeug(e) ohne Tarif`
        : `${input.unassignedTariffVehicleCount} vehicle(s) without tariff`,
      reason: de
        ? 'Diese Fahrzeuge sind nicht buchbar, bis eine aktive Tarifgruppe zugewiesen ist.'
        : 'These vehicles cannot be booked until an active tariff group is assigned.',
      timeSortMs: now,
      cta: 'open-price-tariffs',
      isOverdue: false,
      affectedVehicles: vehicles,
    });
  }

  const pendingPickups = input.pickupItems.filter((p) => !p.done && p.bookingId);
  const pendingReturns = input.returnItems.filter((r) => !r.done && r.bookingId);

  const softOfflineCount = input.dashboardRuntime?.vehicleStates.filter(
    (state) => state.telemetryState === 'soft_offline',
  ).length ?? input.telemetry.softOfflineCount ?? input.telemetry.staleCount;
  const offlineCount = input.dashboardRuntime?.vehicleStates.filter(
    (state) => state.telemetryState === 'offline',
  ).length ?? input.telemetry.offlineCount;
  const affectedTelemetryTotal = softOfflineCount + offlineCount;
  const liveishCount = input.dashboardRuntime
    ? input.dashboardRuntime.vehicleStates.filter(
        (state) => state.telemetryState === 'live' || state.telemetryState === 'standby',
      ).length
    : input.telemetry.freshCount;
  if (
    input.telemetry.hasReliableTimestamps &&
    input.vehicles.length >= 3 &&
    affectedTelemetryTotal >= 3 &&
    affectedTelemetryTotal > liveishCount
  ) {
    items.push({
      id: 'derived-fleet-soft-offline-telemetry',
      source: 'derived-operations',
      severity: offlineCount > 0 || affectedTelemetryTotal > liveishCount * 2 ? 'warning' : 'attention',
      category: 'operations',
      title: de ? 'Viele Fahrzeuge mit Soft-Offline/Offline-Signal' : 'Many vehicles with soft-offline/offline signal',
      reason: de
        ? `${affectedTelemetryTotal} von ${input.telemetry.totalInScope} Fahrzeugen sind Soft Offline oder Offline`
        : `${affectedTelemetryTotal} of ${input.telemetry.totalInScope} vehicles are soft offline or offline`,
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
