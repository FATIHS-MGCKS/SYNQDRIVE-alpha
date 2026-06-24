import type { VehicleData } from '../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type {
  DataFreshnessSummary,
  DataSyncStatus,
  FocusNotReadyVehicle,
} from './dashboardTypes';
import { OPERATOR_FOCUS_MODE_STORAGE_KEY } from './dashboardTypes';
import type { DataTrustLayer } from './dataTrustBuilder';
import type { VehicleTelemetryFreshness } from './controlSignalsBuilder';
import { isVehicleReadyToRent, parseEventTime, type ReadyToRentOptions } from './dashboardUtils';
import type { RuntimeReason, VehicleRuntimeState } from './runtime';

export function readOperatorFocusModePreference(): boolean {
  try {
    return localStorage.getItem(OPERATOR_FOCUS_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistOperatorFocusModePreference(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(OPERATOR_FOCUS_MODE_STORAGE_KEY, '1');
    else localStorage.removeItem(OPERATOR_FOCUS_MODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}


function notReadyReason(v: VehicleData, locale: string, readyOptions: ReadyToRentOptions): string {
  const de = locale === 'de';
  if (v.status === 'Maintenance') return de ? 'Wartung' : 'Maintenance';
  if (v.cleaningStatus !== 'Clean') return de ? 'Reinigung ausstehend' : 'Cleaning pending';
  if (readyOptions.blockedVehicleIds?.has(v.id)) return de ? 'Vermietblockiert' : 'Rental blocked';
  if (readyOptions.healthRiskVehicleIds?.has(v.id)) return de ? 'Health-Risiko' : 'Health risk';
  if (v.status === 'Reserved') return de ? 'Reserviert · nicht bereit' : 'Reserved · not ready';
  return de ? 'Nicht vermietbereit' : 'Not rent-ready';
}

function runtimeReasonLabel(reasons: RuntimeReason[], fallback: string): string {
  return reasons.length > 0 ? reasons[0].title : fallback;
}

export function getFocusNotReadyVehiclesFromRuntime(
  vehicleStates: VehicleRuntimeState[],
  locale: string,
): FocusNotReadyVehicle[] {
  const de = locale === 'de';
  return vehicleStates
    .filter((state) => state.operationalStatus !== 'active_rented' && !state.isReadyToRent)
    .map((state) => {
      const fallback = state.isMaintenance
        ? de ? 'Wartung' : 'Maintenance'
        : state.isBlocked
          ? de ? 'Vermietblockiert' : 'Rental blocked'
          : de ? 'Nicht vermietbereit' : 'Not rent-ready';
      return {
        vehicleId: state.vehicleId,
        label: state.license || state.displayName,
        status: state.operationalStatus,
        reason: runtimeReasonLabel(
          [
            ...state.blockReasons,
            ...state.notReadyReasons,
            ...state.criticalReasons,
            ...state.warningReasons,
          ],
          fallback,
        ),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @deprecated Use getFocusNotReadyVehiclesFromRuntime/dashboard runtime instead.
 * Deprecated: use dashboard runtime/slices instead. Must not be used for active Dashboard KPI/Drawer/Board/Business state.
 */
export function getFocusNotReadyVehicles(
  vehicles: VehicleData[],
  readyOptions: ReadyToRentOptions,
  locale: string,
): FocusNotReadyVehicle[] {
  const items: FocusNotReadyVehicle[] = [];

  for (const v of vehicles) {
    if (v.status === 'Active Rented') continue;
    if (v.status === 'Available' && isVehicleReadyToRent(v, readyOptions)) continue;
    if (
      v.status === 'Reserved' &&
      v.cleaningStatus === 'Clean' &&
      !readyOptions.blockedVehicleIds?.has(v.id) &&
      !readyOptions.healthRiskVehicleIds?.has(v.id)
    ) {
      continue;
    }

    items.push({
      vehicleId: v.id,
      label: v.license || v.model,
      status: v.status,
      reason: notReadyReason(v, locale, readyOptions),
    });
  }

  return items.sort((a, b) => a.label.localeCompare(b.label));
}

export function getOverdueReturns(returns: ReturnTileItem[]): ReturnTileItem[] {
  return returns.filter((r) => !r.done && r.isOverdue);
}

export function getDuePickups(pickups: PickupTileItem[], windowMinutes = 60): PickupTileItem[] {
  const now = Date.now();
  const until = now + windowMinutes * 60_000;

  return pickups
    .filter((p) => {
      if (p.done || p.isOverdue) return false;
      const startMs = parseEventTime(p.startDate);
      if (startMs == null) return true;
      return startMs >= now && startMs <= until;
    })
    .sort((a, b) => {
      const ta = parseEventTime(a.startDate) ?? Number.MAX_SAFE_INTEGER;
      const tb = parseEventTime(b.startDate) ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
}

export function shouldShowDataFreshnessWarning(input: {
  syncStatus: DataSyncStatus;
  telemetry: VehicleTelemetryFreshness;
  dataFreshness: DataFreshnessSummary;
  dataTrust?: DataTrustLayer;
}): boolean {
  if (input.dataFreshness.todayBookingsError || input.dataFreshness.invoicesError) return true;
  if (
    input.dataTrust &&
    (input.dataTrust.overallStatus === 'error' ||
      input.dataTrust.overallStatus === 'stale' ||
      input.dataTrust.overallStatus === 'unavailable')
  ) {
    return true;
  }
  if (input.syncStatus !== 'live') return true;
  if (input.dataFreshness.insightsStale || input.dataFreshness.insightsError) return true;
  if ((input.telemetry.softOfflineCount ?? input.telemetry.staleCount) > 0 || input.telemetry.offlineCount > 0) return true;
  if (input.telemetry.telemetryUnavailable) return true;
  return false;
}

export function dataFreshnessWarningMessage(
  input: {
    syncStatus: DataSyncStatus;
    telemetry: VehicleTelemetryFreshness;
    dataFreshness: DataFreshnessSummary;
    dataTrust?: DataTrustLayer;
  },
  locale: string,
): string {
  const de = locale === 'de';
  if (input.dataFreshness.todayBookingsError) {
    return de
      ? 'Buchungsdaten nicht verfügbar — Handover-KPIs eingeschränkt.'
      : 'Booking data unavailable — handover KPIs limited.';
  }
  if (input.dataFreshness.invoicesError) {
    return de
      ? 'Finanzdaten nicht verfügbar — Business Pulse eingeschränkt.'
      : 'Financial data unavailable — Business Pulse limited.';
  }
  if (input.dataTrust?.overallStatus === 'error') {
    return de
      ? 'Mindestens eine Datenquelle meldet Fehler — Zahlen vor Aktionen prüfen.'
      : 'At least one data source reports errors — verify figures before acting.';
  }
  if (input.dataFreshness.insightsError) {
    return de ? 'Insights nicht verfügbar — Daten können unvollständig sein.' : 'Insights unavailable — data may be incomplete.';
  }
  if (input.syncStatus === 'offline') {
    return de ? 'Sync offline — vor kritischen Aktionen Daten prüfen.' : 'Sync offline — verify data before critical actions.';
  }
  if (input.syncStatus === 'stale' || input.dataFreshness.insightsStale) {
    return de ? 'Daten verzögert — Refresh empfohlen.' : 'Data is delayed — refresh recommended.';
  }
  if (input.telemetry.offlineCount > 0) {
    return de
      ? `${input.telemetry.offlineCount} Fahrzeug(e) offline · Telemetrie prüfen.`
      : `${input.telemetry.offlineCount} vehicle(s) offline · check telemetry.`;
  }
  const softOfflineCount = input.telemetry.softOfflineCount ?? input.telemetry.staleCount;
  if (softOfflineCount > 0) {
    return de
      ? `${softOfflineCount} Fahrzeug(e) Soft Offline · seit 24h kein Signal.`
      : `${softOfflineCount} vehicle(s) soft offline · no signal for 24h.`;
  }
  return de ? 'Datenaktualität eingeschränkt.' : 'Data freshness limited.';
}
