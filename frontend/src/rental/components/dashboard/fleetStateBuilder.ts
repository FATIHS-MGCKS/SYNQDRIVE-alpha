import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import { isVehicleOffline } from '../../data/vehicles';
import type { VehicleHealthResponse } from '../../../lib/api';
import {
  formatFleetDateTime,
  formatFuelPercentCeil,
} from '../../../lib/formatVehicleDisplay';
import { deriveFleetVisualState } from '../../lib/fleetVisualState';
import { parseEventTime } from './dashboardUtils';
import type {
  FleetBoardItem,
  FleetBoardLane,
  FleetBoardLaneSummary,
  FleetBoardModel,
  FleetBoardSeverity,
} from './dashboardTypes';

const MS_HOUR = 60 * 60_000;

function canonicalFuel(v: VehicleData): number | null {
  const preferred = v.isElectric ? v.evSoc ?? v.fuelPercent : v.fuelPercent ?? v.evSoc;
  return typeof preferred === 'number' && Number.isFinite(preferred) ? preferred : null;
}

function isDueSoon(iso: string | null | undefined, now: number): boolean {
  const t = parseEventTime(iso ?? undefined);
  if (t == null) return false;
  const diff = t - now;
  return diff > 0 && diff <= MS_HOUR;
}

function formatLastSeen(lastSignal: string | undefined, locale: string): string | null {
  if (!lastSignal) return null;
  const t = Date.parse(lastSignal);
  if (!Number.isFinite(t)) return null;
  const de = locale === 'de';
  const diffMin = Math.round((Date.now() - t) / 60_000);
  if (diffMin < 2) return de ? 'Gerade eben' : 'Just now';
  if (diffMin < 60) return de ? `vor ${diffMin} Min.` : `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return de ? `vor ${h} Std.` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return de ? `vor ${d} Tag(en)` : `${d}d ago`;
}

function severityRank(s: FleetBoardSeverity): number {
  if (s === 'critical') return 5;
  if (s === 'warning') return 4;
  if (s === 'attention') return 3;
  if (s === 'info') return 2;
  return 1;
}

function severityToBoard(
  visualAttention: string,
  lane: Exclude<FleetBoardLane, 'all'>,
): FleetBoardSeverity {
  if (lane === 'critical') return 'critical';
  if (lane === 'overdue' || lane === 'maintenance') return 'warning';
  if (lane === 'due-soon' || lane === 'cleaning') return 'attention';
  if (lane === 'ready') return 'healthy';
  if (visualAttention === 'critical') return 'critical';
  if (visualAttention === 'warning') return 'warning';
  if (lane === 'rented' || lane === 'reserved') return 'info';
  return 'healthy';
}

function assignLane(
  v: VehicleData,
  healthAlert: VehicleHealthAlert | undefined,
  rentalHealth: VehicleHealthResponse | null,
  now: number,
): Exclude<FleetBoardLane, 'all'> {
  const blocked = rentalHealth?.rental_blocked === true;
  const healthCritical =
    healthAlert?.severity === 'critical' || rentalHealth?.overall_state === 'critical';
  const healthWarning =
    healthAlert?.severity === 'warning' || rentalHealth?.overall_state === 'warning';

  if (healthCritical || blocked) return 'critical';
  if (v.activeIsOverdue || v.reservedIsOverdue) return 'overdue';
  if (
    isDueSoon(v.reservedPickupAt, now) ||
    isDueSoon(v.activeReturnAt, now)
  ) {
    return 'due-soon';
  }
  if (v.status === 'Maintenance') return 'maintenance';
  if (blocked) return 'maintenance';
  if (v.cleaningStatus !== 'Clean' && (v.status === 'Available' || v.status === 'Reserved')) {
    return 'cleaning';
  }
  if (v.status === 'Active Rented') return 'rented';
  if (v.status === 'Reserved') return 'reserved';
  if (v.status === 'Available') {
    if (healthWarning || isVehicleOffline(v) || v.isFresh === false) return 'ready';
    return 'ready';
  }
  return 'maintenance';
}

function statusLabelForLane(
  lane: Exclude<FleetBoardLane, 'all'>,
  visualLabel: string,
  locale: string,
): string {
  const de = locale === 'de';
  const map: Partial<Record<Exclude<FleetBoardLane, 'all'>, [string, string]>> = {
    critical: ['Critical', 'Kritisch'],
    overdue: ['Overdue', 'Überfällig'],
    'due-soon': ['Due soon', 'Bald fällig'],
    maintenance: ['Maintenance', 'Wartung'],
    cleaning: ['Cleaning', 'Reinigung'],
    ready: ['Ready', 'Bereit'],
    rented: ['Active', 'Aktiv'],
    reserved: ['Reserved', 'Reserviert'],
  };
  const pair = map[lane];
  if (pair) return de ? pair[1] : pair[0];
  return visualLabel;
}

function nextAppointment(v: VehicleData, locale: string): string | undefined {
  const intl = locale === 'de' ? 'de-DE' : 'en-US';
  if (v.status === 'Reserved' && v.reservedPickupAt) {
    return formatFleetDateTime(v.reservedPickupAt, intl);
  }
  if (v.status === 'Active Rented' && v.activeReturnAt) {
    return formatFleetDateTime(v.activeReturnAt, intl);
  }
  return undefined;
}

function sortPriority(
  lane: Exclude<FleetBoardLane, 'all'>,
  severity: FleetBoardSeverity,
  v: VehicleData,
): number {
  const laneScore: Record<Exclude<FleetBoardLane, 'all'>, number> = {
    critical: 1000,
    overdue: 900,
    'due-soon': 700,
    maintenance: 600,
    cleaning: 500,
    rented: 400,
    reserved: 300,
    ready: 100,
  };
  return laneScore[lane] + severityRank(severity) * 10 + (v.activeIsOverdue ? 5 : 0);
}

export interface BuildFleetBoardInput {
  locale: string;
  vehicles: VehicleData[];
  healthMap: Map<string, VehicleHealthResponse>;
  healthAlerts: VehicleHealthAlert[];
  filter: FleetBoardLane;
}

export function laneLabel(lane: FleetBoardLane, locale: string): string {
  const de = locale === 'de';
  const labels: Record<FleetBoardLane, [string, string]> = {
    all: ['All', 'Alle'],
    critical: ['Critical', 'Kritisch'],
    overdue: ['Overdue', 'Überfällig'],
    'due-soon': ['Due soon', 'Bald fällig'],
    maintenance: ['Maintenance', 'Wartung'],
    cleaning: ['Cleaning', 'Reinigung'],
    ready: ['Ready', 'Bereit'],
    rented: ['Rented', 'Vermietet'],
    reserved: ['Reserved', 'Reserviert'],
  };
  return de ? labels[lane][1] : labels[lane][0];
}

export const FLEET_BOARD_LANE_ORDER: FleetBoardLane[] = [
  'critical',
  'overdue',
  'due-soon',
  'maintenance',
  'cleaning',
  'ready',
  'rented',
  'reserved',
  'all',
];

export function buildFleetBoard(input: BuildFleetBoardInput): FleetBoardModel {
  const now = Date.now();
  const alertByVehicle = new Map(input.healthAlerts.map((a) => [a.vehicleId, a]));
  const items: FleetBoardItem[] = [];

  for (const v of input.vehicles) {
    const rentalHealth = input.healthMap.get(v.id) ?? null;
    const healthAlert = alertByVehicle.get(v.id);
    const visual = deriveFleetVisualState(v, { rentalHealth });
    const lane = assignLane(v, healthAlert, rentalHealth, now);
    const severity = severityToBoard(visual.attentionLevel, lane);
    const fuel = canonicalFuel(v);
    const fuelLabel =
      fuel != null
        ? `${v.isElectric ? 'SoC' : 'Fuel'} ${formatFuelPercentCeil(fuel)}`
        : null;

    let criticalHint = healthAlert?.primaryReason;
    if (!criticalHint && visual.reason) criticalHint = visual.reason;
    if (!criticalHint && rentalHealth?.blocking_reasons?.length) {
      criticalHint = rentalHealth.blocking_reasons[0];
    }

    items.push({
      vehicleId: v.id,
      lane,
      severity,
      statusLabel: statusLabelForLane(lane, visual.shortLabel, input.locale),
      license: v.license || v.id.slice(0, 6),
      makeModel: [v.make, v.model].filter(Boolean).join(' ') || undefined,
      station: v.station || undefined,
      nextAppointment: nextAppointment(v, input.locale),
      fuelLabel,
      lastSeenLabel: formatLastSeen(v.lastSignal, input.locale),
      criticalHint: severity === 'critical' || severity === 'warning' ? criticalHint : undefined,
      sortPriority: sortPriority(lane, severity, v),
      isOffline: visual.isOffline,
      isStale: visual.isStale,
    });
  }

  items.sort((a, b) => b.sortPriority - a.sortPriority);

  const laneCounts = new Map<Exclude<FleetBoardLane, 'all'>, number>();
  for (const item of items) {
    laneCounts.set(item.lane, (laneCounts.get(item.lane) ?? 0) + 1);
  }

  const lanes: FleetBoardLaneSummary[] = FLEET_BOARD_LANE_ORDER.filter((l) => l !== 'all').map(
    (lane) => ({
      lane,
      label: laneLabel(lane, input.locale),
      count: laneCounts.get(lane as Exclude<FleetBoardLane, 'all'>) ?? 0,
      severity:
        lane === 'critical'
          ? 'critical'
          : lane === 'overdue' || lane === 'maintenance'
            ? 'warning'
            : lane === 'due-soon' || lane === 'cleaning'
              ? 'attention'
              : lane === 'ready'
                ? 'healthy'
                : 'info',
    }),
  );

  lanes.push({
    lane: 'all',
    label: laneLabel('all', input.locale),
    count: items.length,
    severity: 'info',
  });

  const filteredItems =
    input.filter === 'all' ? items : items.filter((i) => i.lane === input.filter);

  return { items, lanes, filteredItems };
}

export function severityChipTone(severity: FleetBoardSeverity) {
  if (severity === 'critical') return 'critical' as const;
  if (severity === 'warning') return 'watch' as const;
  if (severity === 'attention') return 'info' as const;
  if (severity === 'healthy') return 'success' as const;
  return 'neutral' as const;
}
