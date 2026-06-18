import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type { DashboardTimeframe } from './dashboardTypes';
import type {
  NowNextTimelineModel,
  OperationCta,
  OperationEventStatus,
  OperationEventType,
  OperationTimelineItem,
  OperationTimelineLane,
  TodayOperationItem,
  TodayOperationsModel,
  TodayOpsBucket,
} from './dashboardTypes';
import type { StatusTone } from '../../../components/patterns';
import { parseEventTime } from './dashboardUtils';

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function formatTimeLabel(ms: number, locale: string): string {
  const de = locale === 'de';
  const d = new Date(ms);
  const intl = de ? 'de-DE' : 'en-US';
  return d.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });
}

function canonicalFuel(v: VehicleData): number | null {
  const preferred = v.isElectric ? v.evSoc ?? v.fuelPercent : v.fuelPercent ?? v.evSoc;
  return typeof preferred === 'number' && Number.isFinite(preferred) ? preferred : null;
}

function healthSeverityByVehicle(
  alerts: VehicleHealthAlert[],
): Map<string, VehicleHealthAlert> {
  const m = new Map<string, VehicleHealthAlert>();
  for (const a of alerts) m.set(a.vehicleId, a);
  return m;
}

function deriveRisks(
  vehicle: VehicleData | undefined,
  healthAlert: VehicleHealthAlert | undefined,
  ctx: {
    isPickup: boolean;
    isReturn: boolean;
    isOverdue: boolean;
    needsCleaning: boolean;
    vehicleBlocked: boolean;
  },
  locale: string,
): string[] {
  const de = locale === 'de';
  const risks: string[] = [];
  if (!vehicle && !healthAlert) return risks;

  if (ctx.isPickup && vehicle?.status === 'Maintenance') {
    risks.push(de ? 'Fahrzeug in Wartung' : 'Vehicle in maintenance');
  } else if (ctx.isPickup && vehicle && vehicle.status !== 'Available' && vehicle.status !== 'Reserved') {
    risks.push(de ? 'Fahrzeug nicht bereit' : 'Vehicle not ready');
  }

  if (ctx.vehicleBlocked) {
    risks.push(de ? 'Buchungskonflikt' : 'Booking conflict');
  }

  if (ctx.isReturn && ctx.isOverdue) {
    risks.push(de ? 'Rückgabe überfällig' : 'Return overdue');
  }

  if (ctx.needsCleaning) {
    risks.push(de ? 'Reinigung ausstehend' : 'Cleaning required');
  }

  const fuel = vehicle ? canonicalFuel(vehicle) : null;
  if (fuel != null && fuel < 20) {
    risks.push(
      vehicle?.isElectric
        ? de
          ? `Niedriger SoC (${Math.round(fuel)}%)`
          : `Low SoC (${Math.round(fuel)}%)`
        : de
          ? `Niedriger Tankstand (${Math.round(fuel)}%)`
          : `Low fuel (${Math.round(fuel)}%)`,
    );
  }

  if (healthAlert?.severity === 'critical') {
    risks.push(de ? 'Kritischer Health-Alert' : 'Critical health alert');
  } else if (healthAlert?.severity === 'warning') {
    risks.push(de ? 'Health-Warnung' : 'Health warning');
  }

  return risks;
}

function resolveStatus(
  done: boolean,
  isOverdue: boolean,
  timeMs: number,
  now: number,
): OperationEventStatus {
  if (done) return 'completed';
  if (isOverdue) return 'overdue';
  const diff = timeMs - now;
  if (diff <= 0) return 'in-progress';
  if (diff <= 60 * MS_MIN) return 'due-soon';
  return 'pending';
}

function statusTone(status: OperationEventStatus): StatusTone {
  if (status === 'overdue' || status === 'blocked') return 'critical';
  if (status === 'due-soon' || status === 'in-progress') return 'watch';
  if (status === 'completed') return 'success';
  return 'neutral';
}

function sortPriority(
  status: OperationEventStatus,
  timeMs: number,
  now: number,
): number {
  let score = 0;
  if (status === 'overdue') score += 1000;
  if (status === 'blocked') score += 900;
  if (status === 'in-progress') score += 800;
  if (status === 'due-soon') score += 600;
  const proximity = Math.max(0, 400 - Math.floor(Math.abs(timeMs - now) / MS_MIN));
  return score + proximity;
}

function assignLane(
  timeMs: number,
  status: OperationEventStatus,
  timeframe: DashboardTimeframe,
  now: number,
): OperationTimelineLane | null {
  const endToday = endOfDay(new Date(now)).getTime();
  const in60 = now + 60 * MS_MIN;
  const in24h = now + 24 * MS_HOUR;

  if (status === 'overdue' || status === 'in-progress') return 'now';
  if (timeMs < now) return 'now';
  if (timeMs <= in60) return 'next60';
  if (timeMs <= endToday) return 'later-today';
  if (timeframe === 'next24h' && timeMs <= in24h) return 'tomorrow';
  if (timeMs > endToday && timeMs <= in24h && timeframe === 'next24h') return 'tomorrow';
  return null;
}

function assignBucket(
  done: boolean,
  status: OperationEventStatus,
): TodayOpsBucket {
  if (done || status === 'completed') return 'completed';
  if (status === 'in-progress' || status === 'overdue') return 'in-progress';
  return 'todo';
}

function pickupCta(p: PickupTileItem): OperationCta {
  if (p.done) return 'open-booking';
  return 'start-pickup';
}

function returnCta(r: ReturnTileItem): OperationCta {
  if (r.done) return 'open-booking';
  return 'start-return';
}

function vehicleBlockedForPickup(vehicle: VehicleData | undefined): boolean {
  if (!vehicle) return false;
  return vehicle.status === 'Active Rented' || vehicle.status === 'Maintenance';
}

export interface BuildOperationsInput {
  locale: string;
  timeframe: DashboardTimeframe;
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  fleetById: Map<string, VehicleData>;
  vehicleHealthAlerts: VehicleHealthAlert[];
}

function buildPickupTimelineItem(
  p: PickupTileItem,
  input: BuildOperationsInput,
  healthByVehicle: Map<string, VehicleHealthAlert>,
  now: number,
): OperationTimelineItem | null {
  const timeMs = parseEventTime(p.startDate) ?? now;
  const vehicle = p.vehicleId ? input.fleetById.get(p.vehicleId) : undefined;
  const blocked = vehicleBlockedForPickup(vehicle);
  const status = blocked && !p.done ? 'blocked' : resolveStatus(!!p.done, !!p.isOverdue, timeMs, now);
  const lane = assignLane(timeMs, status, input.timeframe, now);
  if (!lane) return null;

  const health = p.vehicleId ? healthByVehicle.get(p.vehicleId) : undefined;
  const risks = deriveRisks(
    vehicle,
    health,
    {
      isPickup: true,
      isReturn: false,
      isOverdue: !!p.isOverdue,
      needsCleaning: p.needsCleaning,
      vehicleBlocked: blocked,
    },
    input.locale,
  );

  let type: OperationEventType = 'pickup';
  if (blocked) type = 'booking-conflict';
  else if (p.needsCleaning && !p.done) type = 'cleaning';

  return {
    id: `pickup-${p.bookingId}`,
    type,
    lane,
    status,
    timeMs,
    timeLabel: formatTimeLabel(timeMs, input.locale),
    vehicleLabel: p.plate || p.vehicle,
    vehicleId: p.vehicleId || undefined,
    customer: p.customer || undefined,
    bookingId: p.bookingId,
    station: p.station || undefined,
    risks,
    tone: statusTone(status),
    cta: pickupCta(p),
    pickupItem: p,
    completed: !!p.done,
    sortPriority: sortPriority(status, timeMs, now),
  };
}

function buildReturnTimelineItem(
  r: ReturnTileItem,
  input: BuildOperationsInput,
  healthByVehicle: Map<string, VehicleHealthAlert>,
  now: number,
): OperationTimelineItem | null {
  const timeMs = parseEventTime(r.endDate) ?? now;
  const vehicle = r.vehicleId ? input.fleetById.get(r.vehicleId) : undefined;
  const status = resolveStatus(!!r.done, !!r.isOverdue, timeMs, now);
  const lane = assignLane(timeMs, status, input.timeframe, now);
  if (!lane) return null;

  const health = r.vehicleId ? healthByVehicle.get(r.vehicleId) : undefined;
  const risks = deriveRisks(
    vehicle,
    health,
    {
      isPickup: false,
      isReturn: true,
      isOverdue: !!r.isOverdue,
      needsCleaning: false,
      vehicleBlocked: false,
    },
    input.locale,
  );

  if (r.hasError) {
    risks.push(input.locale === 'de' ? 'Rückgabe-Problem' : 'Return issue');
  }
  if (r.kmExceeded) {
    risks.push(input.locale === 'de' ? 'KM-Limit überschritten' : 'KM limit exceeded');
  }

  return {
    id: `return-${r.bookingId}`,
    type: r.done ? 'handover' : 'return',
    lane,
    status,
    timeMs,
    timeLabel: formatTimeLabel(timeMs, input.locale),
    vehicleLabel: r.plate || r.vehicle,
    vehicleId: r.vehicleId || undefined,
    customer: r.customer || undefined,
    bookingId: r.bookingId,
    station: r.station || undefined,
    risks,
    tone: statusTone(status),
    cta: returnCta(r),
    returnItem: r,
    completed: !!r.done,
    sortPriority: sortPriority(status, timeMs, now),
  };
}

function buildMaintenanceItems(
  input: BuildOperationsInput,
  now: number,
): OperationTimelineItem[] {
  const items: OperationTimelineItem[] = [];
  const de = input.locale === 'de';

  for (const v of input.fleetById.values()) {
    if (v.status !== 'Maintenance') continue;
    items.push({
      id: `maint-${v.id}`,
      type: 'maintenance',
      lane: 'now',
      status: 'blocked',
      timeMs: now,
      timeLabel: de ? 'Jetzt' : 'Now',
      vehicleLabel: v.license || v.model,
      vehicleId: v.id,
      station: v.station || undefined,
      risks: [de ? 'Wartung blockiert Vermietung' : 'Maintenance blocks rental'],
      tone: 'watch',
      cta: 'open-vehicle',
      completed: false,
      sortPriority: 700,
    });
  }
  return items;
}

function toTodayItem(item: OperationTimelineItem, bucket: TodayOpsBucket): TodayOperationItem {
  return {
    id: item.id,
    bucket,
    type: item.type,
    status: item.status,
    timeMs: item.timeMs,
    timeLabel: item.timeLabel,
    vehicleLabel: item.vehicleLabel,
    vehicleId: item.vehicleId,
    customer: item.customer,
    bookingId: item.bookingId,
    station: item.station,
    risks: item.risks,
    tone: item.tone,
    cta: item.cta,
    pickupItem: item.pickupItem,
    returnItem: item.returnItem,
    completed: item.completed,
    sortPriority: item.sortPriority,
  };
}

function sortItems<T extends { sortPriority: number; timeMs: number; completed: boolean }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (b.sortPriority !== a.sortPriority) return b.sortPriority - a.sortPriority;
    return a.timeMs - b.timeMs;
  });
}

export function buildNowNextTimeline(input: BuildOperationsInput): NowNextTimelineModel {
  const now = Date.now();
  const healthByVehicle = healthSeverityByVehicle(input.vehicleHealthAlerts);
  const lanes: Record<OperationTimelineLane, OperationTimelineItem[]> = {
    now: [],
    next60: [],
    'later-today': [],
    tomorrow: [],
  };

  const all: OperationTimelineItem[] = [];

  for (const p of input.pickupItems) {
    const item = buildPickupTimelineItem(p, input, healthByVehicle, now);
    if (item) all.push(item);
  }
  for (const r of input.returnItems) {
    const item = buildReturnTimelineItem(r, input, healthByVehicle, now);
    if (item) all.push(item);
  }
  all.push(...buildMaintenanceItems(input, now));

  for (const item of all) {
    lanes[item.lane].push(item);
  }

  for (const lane of Object.keys(lanes) as OperationTimelineLane[]) {
    lanes[lane] = sortItems(lanes[lane]);
  }

  return { lanes, totalCount: all.length };
}

export function buildTodayOperations(input: BuildOperationsInput): TodayOperationsModel {
  const timeline = buildNowNextTimeline(input);
  const flat: OperationTimelineItem[] = [
    ...timeline.lanes.now,
    ...timeline.lanes.next60,
    ...timeline.lanes['later-today'],
    ...timeline.lanes.tomorrow,
  ];

  const seen = new Set<string>();
  const todo: TodayOperationItem[] = [];
  const inProgress: TodayOperationItem[] = [];
  const completed: TodayOperationItem[] = [];

  for (const item of sortItems(flat)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const bucket = assignBucket(item.completed, item.status);
    const todayItem = toTodayItem(item, bucket);
    if (bucket === 'completed') completed.push(todayItem);
    else if (bucket === 'in-progress') inProgress.push(todayItem);
    else todo.push(todayItem);
  }

  return {
    todo: sortItems(todo),
    inProgress: sortItems(inProgress),
    completed: sortItems(completed),
    totalCount: todo.length + inProgress.length + completed.length,
  };
}

export const TIMELINE_LANE_ORDER: OperationTimelineLane[] = [
  'now',
  'next60',
  'later-today',
  'tomorrow',
];

export function laneLabel(lane: OperationTimelineLane, locale: string): string {
  const de = locale === 'de';
  if (lane === 'now') return de ? 'Jetzt' : 'Now';
  if (lane === 'next60') return de ? 'Nächste 60 Min.' : 'Next 60 minutes';
  if (lane === 'later-today') return de ? 'Später heute' : 'Later today';
  return de ? 'Morgen / +24h' : 'Tomorrow / next 24h';
}

export function typeLabel(type: OperationEventType, locale: string): string {
  const de = locale === 'de';
  const map: Record<OperationEventType, [string, string]> = {
    pickup: ['Pickup', 'Abholung'],
    return: ['Return', 'Rückgabe'],
    handover: ['Handover', 'Übergabe'],
    cleaning: ['Cleaning', 'Reinigung'],
    maintenance: ['Maintenance', 'Wartung'],
    'booking-conflict': ['Conflict', 'Konflikt'],
  };
  return de ? map[type][1] : map[type][0];
}

export function statusLabel(status: OperationEventStatus, locale: string): string {
  const de = locale === 'de';
  const map: Record<OperationEventStatus, [string, string]> = {
    'due-soon': ['Due soon', 'Bald fällig'],
    overdue: ['Overdue', 'Überfällig'],
    completed: ['Completed', 'Erledigt'],
    pending: ['Pending', 'Ausstehend'],
    blocked: ['Blocked', 'Blockiert'],
    'in-progress': ['In progress', 'Läuft'],
  };
  return de ? map[status][1] : map[status][0];
}

export function ctaLabel(cta: OperationCta, locale: string): string {
  const de = locale === 'de';
  if (cta === 'start-pickup') return de ? 'Abholung starten' : 'Start pickup';
  if (cta === 'start-return') return de ? 'Rückgabe starten' : 'Start return';
  if (cta === 'open-booking') return de ? 'Buchung öffnen' : 'Open booking';
  if (cta === 'open-vehicle') return de ? 'Fahrzeug öffnen' : 'Open vehicle';
  return de ? 'Vermietung öffnen' : 'Open rental';
}
