import type { DashboardInsight } from '../../DashboardInsightsContext';
import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import { resolveTelemetryFreshness } from '../../lib/telemetryFreshness';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { Station } from '../../../lib/api';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type {
  ActionQueueCta,
  ActionQueueSeverity,
  TodayBookingApiRow,
} from './dashboardTypes';
import type { VehicleTelemetryFreshness } from './controlSignalsBuilder';
import { isVehicleReadyToRent, parseEventTime, type ReadyToRentOptions } from './dashboardUtils';
import type { DashboardRuntimeModel, RuntimeReason, VehicleRuntimeState } from './runtime';
import { VEHICLE_OPERATIONAL_STATUS } from '../../lib/vehicle-operational-state';

export type PredictiveRiskType =
  | 'RETURN_OVERDUE_THREATENS_FOLLOWUP'
  | 'VEHICLE_NOT_READY_BEFORE_PICKUP'
  | 'CRITICAL_ALERT_RENTAL_RISK'
  | 'SOFT_OFFLINE_TELEMETRY_CHECK'
  | 'LOW_ENERGY_BEFORE_PICKUP'
  | 'CLEANING_PENDING_BEFORE_BOOKING'
  | 'BLOCKED_VEHICLE_FUTURE_BOOKING'
  | 'STATION_SHORTAGE_24H';

export type PredictiveConfidence = 'high' | 'medium' | 'low';

export type PredictiveAffectedEntity =
  | { kind: 'vehicle'; vehicleId: string; label?: string }
  | { kind: 'booking'; bookingId: string; vehicleId?: string; label?: string }
  | { kind: 'station'; stationId: string; label?: string };

export interface PredictiveOperationsInsight {
  id: string;
  type: PredictiveRiskType;
  severity: ActionQueueSeverity;
  title: string;
  explanation: string;
  affectedEntity: PredictiveAffectedEntity;
  sourceData: string;
  recommendedAction: string;
  confidence: PredictiveConfidence;
  timeSortMs: number;
  timeLabel?: string;
  cta: ActionQueueCta;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  isOverdue: boolean;
}

const MS_HOUR = 60 * 60_000;
const PICKUP_WINDOW_MS = 24 * MS_HOUR;
const LOW_FUEL_PERCENT = 25;
const LOW_EV_SOC_PERCENT = 30;

function healthByVehicle(alerts: VehicleHealthAlert[]): Map<string, VehicleHealthAlert> {
  const m = new Map<string, VehicleHealthAlert>();
  for (const a of alerts) m.set(a.vehicleId, a);
  return m;
}

function isRentalBlocked(vehicleId: string, healthMap: Map<string, VehicleHealthResponse>): boolean {
  return healthMap.get(vehicleId)?.rental_blocked === true;
}

function vehicleLabel(v: VehicleData | undefined, fallback?: string): string {
  return v?.license || v?.model || fallback || 'Vehicle';
}

function readFuelPercent(v: VehicleData): number | null {
  if (v.fuelPercent != null && Number.isFinite(v.fuelPercent)) return v.fuelPercent;
  if (v.fuel > 0 && v.fuel <= 100) return v.fuel;
  return null;
}

function readEvSoc(v: VehicleData): number | null {
  if (v.evSoc != null && Number.isFinite(v.evSoc)) return v.evSoc;
  if (v.isElectric && v.battery > 0 && v.battery <= 100) return v.battery;
  return null;
}

function telemetryRiskBucket(
  v: VehicleData,
): 'offline' | 'stale' | 'unknown' | 'fresh' | 'none' {
  // Central 5-state freshness. STANDBY is normal (fresh); only soft-offline
  // (signal_delayed, 24–48h) is "stale", offline ≥48h, never-reported → none.
  const f = resolveTelemetryFreshness(v);
  if (f.isOffline) return 'offline';
  if (f.isNoSignal) return 'none';
  if (f.isSignalDelayed) return 'stale';
  return 'fresh';
}

function runtimeTelemetryRiskBucket(
  state: VehicleRuntimeState | undefined,
): 'offline' | 'soft_offline' | 'none' {
  if (!state) return 'none';
  if (state.telemetryState === 'offline') return 'offline';
  if (state.telemetryState === 'soft_offline') return 'soft_offline';
  return 'none';
}

function reasonSummary(reasons: RuntimeReason[], fallback: string): string {
  return reasons.length > 0
    ? reasons.slice(0, 2).map((reason) => reason.title).join(' · ')
    : fallback;
}

function pickupWithinWindow(startMs: number | null, now: number, windowMs: number): boolean {
  if (startMs == null) return false;
  const until = startMs - now;
  return until >= 0 && until <= windowMs;
}

function vehiclesAtStation(vehicles: VehicleData[], stationId: string): VehicleData[] {
  return vehicles.filter(
    (v) =>
      v.stationId === stationId ||
      v.homeStationId === stationId ||
      v.currentStationId === stationId,
  );
}

function countReadyAtStation(
  vehicles: VehicleData[],
  stationId: string,
  readyOptions: ReadyToRentOptions,
  runtime?: DashboardRuntimeModel,
  stationName?: string,
): number {
  if (runtime) {
    return runtime.vehicleStates.filter(
      (state) =>
        (state.stationId === stationId || state.stationLabel === stationName) &&
        state.isReadyToRent,
    ).length;
  }
  return vehiclesAtStation(vehicles, stationId).filter((v) =>
    isVehicleReadyToRent(v, readyOptions),
  ).length;
}

function hasStationShortageInsight(stationId: string, insights: DashboardInsight[]): boolean {
  return insights.some(
    (i) =>
      i.type === 'STATION_SHORTAGE' &&
      (i.entityIds ?? []).some((id) => id === stationId),
  );
}

export function derivePredictiveOperationsInsights(input: {
  locale: string;
  stationFilter: string | null;
  vehicles: VehicleData[];
  fleetById: Map<string, VehicleData>;
  stations: Station[];
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  todayPickups: TodayBookingApiRow[];
  healthAlerts: VehicleHealthAlert[];
  healthMap: Map<string, VehicleHealthResponse>;
  telemetry: VehicleTelemetryFreshness;
  readyOptions: ReadyToRentOptions;
  dashboardRuntime?: DashboardRuntimeModel;
  insights: DashboardInsight[];
  fleetLoading: boolean;
  todayBookingsLoaded: boolean;
}): PredictiveOperationsInsight[] {
  const de = input.locale === 'de';
  const items: PredictiveOperationsInsight[] = [];
  const now = Date.now();
  const healthAlerts = healthByVehicle(input.healthAlerts);
  const runtimeByVehicleId = new Map(
    (input.dashboardRuntime?.vehicleStates ?? []).map((state) => [state.vehicleId, state]),
  );
  const seen = new Set<string>();

  if (!input.todayBookingsLoaded || input.fleetLoading) return items;

  const pendingPickups = input.pickupItems.filter((p) => !p.done && p.bookingId);
  const pendingReturns = input.returnItems.filter((r) => !r.done && r.bookingId);

  const push = (insight: PredictiveOperationsInsight) => {
    if (seen.has(insight.id)) return;
    seen.add(insight.id);
    items.push(insight);
  };

  // 1) Overdue return threatens follow-up booking on same vehicle
  for (const r of pendingReturns) {
    if (!r.isOverdue || !r.vehicleId || !r.bookingId) continue;
    const followPickup = pendingPickups.find(
      (p) => p.vehicleId === r.vehicleId && !p.done && p.bookingId,
    );
    if (!followPickup?.bookingId) continue;

    const vehicle = input.fleetById.get(r.vehicleId);
    const label = vehicleLabel(vehicle, r.plate || r.vehicle);
    const followMs = parseEventTime(followPickup.startDate);

    push({
      id: `predictive-return-threatens-followup-${r.vehicleId}`,
      type: 'RETURN_OVERDUE_THREATENS_FOLLOWUP',
      severity: 'critical',
      title: de
        ? 'Operatives Risiko · Rückgabe gefährdet Folgebooking'
        : 'Operational risk · return threatens follow-up booking',
      explanation: de
        ? `${label} hat eine überfällige Rückgabe und ein weiteres Pickup ist geplant.`
        : `${label} has an overdue return and another pickup is scheduled.`,
      affectedEntity: {
        kind: 'vehicle',
        vehicleId: r.vehicleId,
        label,
      },
      sourceData: de
        ? `Rückgabe überfällig (BK ${r.bookingId}) · Folge-Pickup ${followPickup.bookingId}`
        : `Return overdue (BK ${r.bookingId}) · follow-up pickup ${followPickup.bookingId}`,
      recommendedAction: de
        ? 'Rückgabe-Handover abschließen, bevor das Folgebooking startet.'
        : 'Complete the return handover before the follow-up pickup starts.',
      confidence: 'high',
      timeSortMs: followMs ?? now,
      timeLabel: followMs
        ? de
          ? `Pickup ${new Date(followMs).toLocaleTimeString(de ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`
          : undefined
        : undefined,
      cta: 'start-handover-return',
      vehicleId: r.vehicleId,
      bookingId: r.bookingId,
      isOverdue: true,
    });
  }

  // 2–6) Per-upcoming-pickup vehicle risks (next 24h)
  for (const p of pendingPickups) {
    if (!p.bookingId || p.isOverdue) continue;
    const startMs = parseEventTime(p.startDate);
    if (!pickupWithinWindow(startMs, now, PICKUP_WINDOW_MS)) continue;

    const vehicle = p.vehicleId ? input.fleetById.get(p.vehicleId) : undefined;
    const runtimeState = p.vehicleId ? runtimeByVehicleId.get(p.vehicleId) : undefined;
    const label = vehicleLabel(vehicle, p.plate || p.vehicle);
    const hoursUntil = startMs != null ? Math.max(1, Math.round((startMs - now) / MS_HOUR)) : null;
    const timeLabel =
      hoursUntil != null
        ? de
          ? `in ${hoursUntil} Std.`
          : `in ${hoursUntil}h`
        : p.time;

    const ready = runtimeState
      ? runtimeState.isReadyToRent
      : vehicle &&
        isVehicleReadyToRent(vehicle, input.readyOptions) &&
        (vehicle.status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE || vehicle.status === VEHICLE_OPERATIONAL_STATUS.RESERVED);

    if (vehicle && !ready && runtimeState?.operationalStatus !== 'maintenance' && vehicle.status !== VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) {
      const healthAlert = p.vehicleId ? healthAlerts.get(p.vehicleId) : undefined;
      const onlyCleaningIssue =
        (runtimeState
          ? runtimeState.warningReasons.some((reason) => reason.category === 'cleaning')
          : vehicle.cleaningStatus !== 'Clean') &&
        !isRentalBlocked(vehicle.id, input.healthMap);
      if (healthAlert?.severity !== 'critical' && !onlyCleaningIssue) {
        const notReadyReasons = [
          ...(runtimeState?.blockReasons ?? []),
          ...(runtimeState?.notReadyReasons ?? []),
          ...(runtimeState?.warningReasons ?? []),
        ];
        push({
          id: `predictive-not-ready-${p.bookingId}`,
          type: 'VEHICLE_NOT_READY_BEFORE_PICKUP',
          severity: hoursUntil != null && hoursUntil <= 3 ? 'warning' : 'attention',
          title: de
            ? 'Operatives Risiko · Fahrzeug nicht bereit'
            : 'Operational risk · vehicle not ready',
          explanation: de
            ? `${label} ist für das anstehende Pickup nicht vermietbereit.`
            : `${label} is not rent-ready for the upcoming pickup.`,
          affectedEntity: {
            kind: 'booking',
            bookingId: p.bookingId,
            vehicleId: p.vehicleId || undefined,
            label,
          },
          sourceData: de
            ? reasonSummary(notReadyReasons, `Runtime: ${runtimeState?.rentalReadiness ?? vehicle.status}`)
            : reasonSummary(notReadyReasons, `Runtime: ${runtimeState?.rentalReadiness ?? vehicle.status}`),
          recommendedAction: de
            ? 'Fahrzeugstatus prüfen und vor Pickup bereitstellen.'
            : 'Review vehicle status and make it ready before pickup.',
          confidence: hoursUntil != null && hoursUntil <= 3 ? 'high' : 'medium',
          timeSortMs: startMs ?? now,
          timeLabel,
          cta: p.vehicleId ? 'open-vehicle' : 'open-booking',
          vehicleId: p.vehicleId || undefined,
          bookingId: p.bookingId,
          isOverdue: false,
        });
      }
    }

    if (vehicle && (runtimeState
      ? runtimeState.warningReasons.some((reason) => reason.category === 'cleaning')
      : vehicle.cleaningStatus !== 'Clean')) {
      push({
        id: `predictive-cleaning-${p.bookingId}`,
        type: 'CLEANING_PENDING_BEFORE_BOOKING',
        severity: hoursUntil != null && hoursUntil <= 2 ? 'warning' : 'attention',
        title: de
          ? 'Operatives Risiko · Reinigung ausstehend'
          : 'Operational risk · cleaning pending',
        explanation: de
          ? `${label} benötigt Reinigung vor dem nächsten Pickup.`
          : `${label} needs cleaning before the next pickup.`,
        affectedEntity: {
          kind: 'booking',
          bookingId: p.bookingId,
          vehicleId: p.vehicleId || undefined,
          label,
        },
        sourceData: de
          ? `cleaningStatus=${vehicle.cleaningStatus} · Pickup BK ${p.bookingId}`
          : `cleaningStatus=${vehicle.cleaningStatus} · pickup BK ${p.bookingId}`,
        recommendedAction: de ? 'Reinigung einplanen oder abschließen.' : 'Schedule or complete cleaning.',
        confidence: hoursUntil != null && hoursUntil <= 2 ? 'high' : 'medium',
        timeSortMs: startMs ?? now,
        timeLabel,
        cta: p.vehicleId ? 'open-vehicle' : 'open-booking',
        vehicleId: p.vehicleId || undefined,
        bookingId: p.bookingId,
        isOverdue: false,
      });
    }

    if (p.vehicleId) {
      const alert = healthAlerts.get(p.vehicleId);
      if (runtimeState?.criticalReasons.length || alert?.severity === 'critical') {
        const primaryCritical = runtimeState?.criticalReasons[0]?.title ?? alert?.primaryReason;
        push({
          id: `predictive-critical-rental-${p.vehicleId}-${p.bookingId}`,
          type: 'CRITICAL_ALERT_RENTAL_RISK',
          severity: 'critical',
          title: de
            ? 'Operatives Risiko · Vermietung nicht empfohlen'
            : 'Operational risk · rental not recommended',
          explanation: de
            ? `${primaryCritical} — kritischer Runtime-Grund bei geplantem Pickup.`
            : `${primaryCritical} — critical runtime reason with scheduled pickup.`,
          affectedEntity: {
            kind: 'vehicle',
            vehicleId: p.vehicleId,
            label,
          },
          sourceData: de
            ? reasonSummary(runtimeState?.criticalReasons ?? [], `Health: ${primaryCritical}`)
            : reasonSummary(runtimeState?.criticalReasons ?? [], `Health: ${primaryCritical}`),
          recommendedAction: de
            ? 'Health prüfen; ggf. Fahrzeug tauschen oder Buchung anpassen.'
            : 'Review health; consider swapping vehicle or adjusting booking.',
          confidence: 'high',
          timeSortMs: startMs ?? now,
          timeLabel,
          cta: 'open-vehicle',
          vehicleId: p.vehicleId,
          bookingId: p.bookingId,
          isOverdue: false,
        });
      }

      if (vehicle) {
        const tel = runtimeState ? runtimeTelemetryRiskBucket(runtimeState) : telemetryRiskBucket(vehicle);
        if (tel === 'offline' || tel === 'stale' || tel === 'soft_offline') {
          push({
            id: `predictive-telemetry-${p.vehicleId}-${p.bookingId}`,
            type: 'SOFT_OFFLINE_TELEMETRY_CHECK',
            severity: tel === 'offline' ? 'warning' : 'attention',
            title: de
              ? 'Operatives Risiko · Telemetrie prüfen'
              : 'Operational risk · check telemetry',
            explanation: de
              ? `${label} ist ${tel === 'offline' ? 'Offline' : 'Soft Offline'} vor Pickup.`
              : `${label} is ${tel === 'offline' ? 'offline' : 'soft offline'} before pickup.`,
            affectedEntity: {
              kind: 'vehicle',
              vehicleId: p.vehicleId,
              label,
            },
            sourceData: de
              ? `lastSignal=${vehicle.lastSignal || '—'} · onlineStatus=${vehicle.onlineStatus ?? '—'}`
              : `lastSignal=${vehicle.lastSignal || '—'} · onlineStatus=${vehicle.onlineStatus ?? '—'}`,
            recommendedAction: de
              ? 'Fahrzeug vor Übergabe physisch prüfen (Kraftstoff/Standort/Zustand).'
              : 'Physically verify vehicle before handover (fuel/location/condition).',
            confidence: tel === 'offline' ? 'medium' : 'low',
            timeSortMs: startMs ?? now,
            timeLabel,
            cta: 'open-vehicle',
            vehicleId: p.vehicleId,
            bookingId: p.bookingId,
            isOverdue: false,
          });
        }

        const fuel = readFuelPercent(vehicle);
        const soc = readEvSoc(vehicle);
        const isEv =
          vehicle.isElectric ||
          vehicle.fuelType === 'Electric' ||
          vehicle.fuelType === 'PHEV' ||
          vehicle.fuelType === 'Hybrid';

        if (fuel != null && !isEv && fuel < LOW_FUEL_PERCENT) {
          push({
            id: `predictive-low-fuel-${p.vehicleId}-${p.bookingId}`,
            type: 'LOW_ENERGY_BEFORE_PICKUP',
            severity: fuel < 15 ? 'warning' : 'attention',
            title: de
              ? 'Operatives Risiko · niedriger Kraftstoff'
              : 'Operational risk · low fuel',
            explanation: de
              ? `${label} meldet ${Math.round(fuel)} % Kraftstoff vor Pickup.`
              : `${label} reports ${Math.round(fuel)}% fuel before pickup.`,
            affectedEntity: {
              kind: 'vehicle',
              vehicleId: p.vehicleId,
              label,
            },
            sourceData: de
              ? `fuelPercent=${fuel} · Pickup BK ${p.bookingId}`
              : `fuelPercent=${fuel} · pickup BK ${p.bookingId}`,
            recommendedAction: de ? 'Tankstand prüfen oder betanken lassen.' : 'Verify or refuel before pickup.',
            confidence: vehicle.isFresh === true ? 'medium' : 'low',
            timeSortMs: startMs ?? now,
            timeLabel,
            cta: 'open-vehicle',
            vehicleId: p.vehicleId,
            bookingId: p.bookingId,
            isOverdue: false,
          });
        }

        if (soc != null && isEv && soc < LOW_EV_SOC_PERCENT) {
          push({
            id: `predictive-low-soc-${p.vehicleId}-${p.bookingId}`,
            type: 'LOW_ENERGY_BEFORE_PICKUP',
            severity: soc < 15 ? 'warning' : 'attention',
            title: de
              ? 'Operatives Risiko · niedriger Ladestand'
              : 'Operational risk · low charge',
            explanation: de
              ? `${label} meldet ${Math.round(soc)} % SoC vor Pickup.`
              : `${label} reports ${Math.round(soc)}% SoC before pickup.`,
            affectedEntity: {
              kind: 'vehicle',
              vehicleId: p.vehicleId,
              label,
            },
            sourceData: de
              ? `evSoc=${soc} · Pickup BK ${p.bookingId}`
              : `evSoc=${soc} · pickup BK ${p.bookingId}`,
            recommendedAction: de ? 'Ladestand prüfen oder laden lassen.' : 'Verify charge level or charge before pickup.',
            confidence: vehicle.isFresh === true ? 'medium' : 'low',
            timeSortMs: startMs ?? now,
            timeLabel,
            cta: 'open-vehicle',
            vehicleId: p.vehicleId,
            bookingId: p.bookingId,
            isOverdue: false,
          });
        }
      }
    }
  }

  // 7) Maintenance / blocked vehicle with future booking
  for (const v of input.vehicles) {
    const runtimeState = runtimeByVehicleId.get(v.id);
    const blocked = runtimeState ? runtimeState.isBlocked : isRentalBlocked(v.id, input.healthMap);
    const maintenance = runtimeState ? runtimeState.isMaintenance : v.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
    if (!blocked && !maintenance) continue;

    const reservedMs = parseEventTime(v.reservedPickupAt ?? undefined);
    const hasReservedWindow = reservedMs != null && reservedMs - now <= PICKUP_WINDOW_MS && reservedMs >= now;
    const linkedPickup = pendingPickups.find((p) => p.vehicleId === v.id && !p.done);
    if (!hasReservedWindow && !linkedPickup) continue;

    const startMs = reservedMs ?? parseEventTime(linkedPickup?.startDate);
    const label = vehicleLabel(v);

    push({
      id: `predictive-blocked-future-${v.id}`,
      type: 'BLOCKED_VEHICLE_FUTURE_BOOKING',
      severity: v.reservedIsOverdue || linkedPickup?.isOverdue ? 'critical' : 'warning',
      title: de
        ? 'Operatives Risiko · blockiertes Fahrzeug gebucht'
        : 'Operational risk · blocked vehicle booked',
      explanation: de
        ? `${label} ist ${maintenance ? 'in Wartung' : 'vermietblockiert'}, hat aber eine zukünftige Buchung.`
        : `${label} is ${maintenance ? 'in maintenance' : 'rental-blocked'} but has a future booking.`,
      affectedEntity: { kind: 'vehicle', vehicleId: v.id, label },
      sourceData: de
        ? reasonSummary(runtimeState?.blockReasons ?? [], `Runtime: ${runtimeState?.rentalReadiness ?? v.status}${v.reservedBookingId ? ` · BK ${v.reservedBookingId}` : ''}`)
        : reasonSummary(runtimeState?.blockReasons ?? [], `Runtime: ${runtimeState?.rentalReadiness ?? v.status}${v.reservedBookingId ? ` · BK ${v.reservedBookingId}` : ''}`),
      recommendedAction: de
        ? 'Buchung prüfen, Fahrzeug freigeben oder Ersatzfahrzeug zuweisen.'
        : 'Review booking, release vehicle, or assign a replacement.',
      confidence: blocked && maintenance ? 'high' : 'medium',
      timeSortMs: startMs ?? now,
      cta: 'open-vehicle',
      vehicleId: v.id,
      bookingId: linkedPickup?.bookingId || v.reservedBookingId || undefined,
      isOverdue: !!(v.reservedIsOverdue || linkedPickup?.isOverdue),
    });
  }

  // 8) Station shortage next 24h (rule-based, not probabilistic)
  const stationScope = input.stationFilter
    ? input.stations.filter((s) => s.id === input.stationFilter)
    : input.stations;

  for (const station of stationScope) {
    if (hasStationShortageInsight(station.id, input.insights)) continue;

    const pickupsAtStation = input.todayPickups.filter((p) => {
      if (p.pickupStationId !== station.id) return false;
      const startMs = parseEventTime(p.startDate);
      if (startMs == null) return false;
      const until = startMs - now;
      return until >= 0 && until <= PICKUP_WINDOW_MS && !p.pickupProtocol;
    });

    if (pickupsAtStation.length === 0) continue;

    const readyCount = countReadyAtStation(input.vehicles, station.id, input.readyOptions, input.dashboardRuntime, station.name);
    const demand = pickupsAtStation.length;
    const gap = demand - readyCount;

    if (gap <= 0 && readyCount > 0) continue;

    const severity: ActionQueueSeverity =
      readyCount === 0 && demand >= 2
        ? 'critical'
        : gap >= 2 || readyCount === 0
          ? 'warning'
          : 'attention';

    push({
      id: `predictive-station-shortage-${station.id}`,
      type: 'STATION_SHORTAGE_24H',
      severity,
      title: de
        ? 'Operatives Risiko · Stations-Engpass (24h)'
        : 'Operational risk · station squeeze (24h)',
      explanation: de
        ? `${station.name}: ${demand} Pickups in 24h bei ${readyCount} vermietbereiten Fahrzeugen.`
        : `${station.name}: ${demand} pickups in 24h with ${readyCount} rent-ready vehicles.`,
      affectedEntity: { kind: 'station', stationId: station.id, label: station.name },
      sourceData: de
        ? `${demand} geplante Pickups · ${readyCount} ready-to-rent am Standort`
        : `${demand} scheduled pickups · ${readyCount} ready-to-rent at station`,
      recommendedAction: de
        ? 'Kapazität prüfen: Reinigung, Freigaben oder Umbuchungen einplanen.'
        : 'Review capacity: cleaning, releases, or reassignments.',
      confidence: readyCount === 0 ? 'high' : gap >= 2 ? 'medium' : 'low',
      timeSortMs: now + MS_HOUR,
      cta: 'open-stations',
      stationId: station.id,
      isOverdue: false,
    });
  }

  return items;
}
