import type { ApiTask, VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import {
  bookingStatusLabel,
  normalizeBookingStatus,
  type BookingUiStatus,
} from '../../rental/components/bookings/bookingStatus';
import { formatApiTime } from '../../rental/components/dashboard/dashboardUtils';
import {
  deriveBookingPickupGate,
  deriveBookingReturnGate,
  todayRowToPickupGateInput,
  todayRowToReturnGateInput,
} from '../../rental/lib/bookingHandoverGates';
import type { OperatorScanBookingHit } from '../hooks/useOperatorScanSearch';

export type OperatorHandoverKind = 'PICKUP' | 'RETURN';

export interface OperatorActionGate {
  allowed: boolean;
  reason?: string;
}

export interface OperatorTodayBookingItem {
  bookingId: string;
  kind: OperatorHandoverKind;
  vehicleId: string;
  customerId?: string | null;
  vehicleName: string;
  plate: string;
  customerName: string;
  station: string;
  scheduledAt: string;
  timeLabel: string;
  status: BookingUiStatus;
  statusLabel: string;
  isOverdue: boolean;
  isDueNow: boolean;
  isDone: boolean;
  pickupGate: OperatorActionGate;
  returnGate: OperatorActionGate;
  raw: TodayBookingApiRow;
}

export interface OperatorBlockedVehicleItem {
  vehicleId: string;
  label: string;
  plate: string;
  station: string;
  reasons: string[];
}

export interface OperatorTodaySnapshot {
  dueNow: OperatorTodayBookingItem[];
  pickupsToday: OperatorTodayBookingItem[];
  returnsToday: OperatorTodayBookingItem[];
  openTasks: ApiTask[];
  vehicleCheckTasks: ApiTask[];
  blockedVehicles: OperatorBlockedVehicleItem[];
}

const CHECK_TASK_TYPES = new Set<ApiTask['type']>([
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'BOOKING_PREPARATION',
]);

const DUE_NOW_WINDOW_MS = 2 * 60 * 60 * 1000;

function normalizeTodayRows(res: unknown): TodayBookingApiRow[] {
  if (Array.isArray(res)) return res as TodayBookingApiRow[];
  if (res && typeof res === 'object' && Array.isArray((res as { data?: unknown }).data)) {
    return (res as { data: TodayBookingApiRow[] }).data;
  }
  return [];
}

export { normalizeTodayRows };

function isDueNow(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs + DUE_NOW_WINDOW_MS;
}

function healthForVehicle(
  vehicleId: string | undefined,
  healthMap: Map<string, VehicleHealthResponse>,
): VehicleHealthResponse | null {
  if (!vehicleId) return null;
  return healthMap.get(vehicleId) ?? null;
}

export function derivePickupGate(
  row: TodayBookingApiRow,
  healthMap: Map<string, VehicleHealthResponse>,
): OperatorActionGate {
  const health = healthForVehicle(row.vehicleId, healthMap);
  return deriveBookingPickupGate(todayRowToPickupGateInput(row, health));
}

export function deriveReturnGate(row: TodayBookingApiRow): OperatorActionGate {
  return deriveBookingReturnGate(todayRowToReturnGateInput(row));
}

export function mapPickupRow(
  row: TodayBookingApiRow,
  healthMap: Map<string, VehicleHealthResponse>,
  locale: string,
  nowMs: number,
): OperatorTodayBookingItem | null {
  const bookingId = String(row.id ?? '');
  if (!bookingId) return null;
  const status = normalizeBookingStatus(row.statusEnum, row.status);
  const scheduledAt = String(row.startDate ?? '');
  const isDone = Boolean(row.pickupProtocol);
  const isOverdue = Boolean(row.isOverdue);
  const pickupGate = derivePickupGate(row, healthMap);
  return {
    bookingId,
    kind: 'PICKUP',
    vehicleId: String(row.vehicleId ?? ''),
    customerId: row.customerId ?? null,
    vehicleName: row.vehicleName ?? '—',
    plate: row.vehicleLicense ?? '',
    customerName: row.customerName ?? '',
    station: row.pickupStationName ?? row.stationLabel ?? row.station ?? '',
    scheduledAt,
    timeLabel: formatApiTime(scheduledAt, locale) || '—',
    status,
    statusLabel: bookingStatusLabel(status),
    isOverdue,
    isDueNow: isOverdue || isDueNow(scheduledAt, nowMs),
    isDone,
    pickupGate,
    returnGate: { allowed: false, reason: 'Kein Return bei Abholung' },
    raw: row,
  };
}

export function mapReturnRow(
  row: TodayBookingApiRow,
  locale: string,
  nowMs: number,
): OperatorTodayBookingItem | null {
  const bookingId = String(row.id ?? '');
  if (!bookingId) return null;
  const status = normalizeBookingStatus(row.statusEnum, row.status);
  const scheduledAt = String(row.endDate ?? '');
  const isDone = Boolean(row.returnProtocol);
  const isOverdue = Boolean(row.isOverdue);
  const returnGate = deriveReturnGate(row);
  return {
    bookingId,
    kind: 'RETURN',
    vehicleId: String(row.vehicleId ?? ''),
    customerId: row.customerId ?? null,
    vehicleName: row.vehicleName ?? '—',
    plate: row.vehicleLicense ?? '',
    customerName: row.customerName ?? '',
    station: row.returnStationName ?? row.stationLabel ?? row.station ?? '',
    scheduledAt,
    timeLabel: formatApiTime(scheduledAt, locale) || '—',
    status,
    statusLabel: bookingStatusLabel(status),
    isOverdue,
    isDueNow: isOverdue || isDueNow(scheduledAt, nowMs),
    isDone,
    pickupGate: { allowed: false, reason: 'Kein Pickup bei Rückgabe' },
    returnGate,
    raw: row,
  };
}

export function buildOperatorTodaySnapshot(input: {
  pickups: TodayBookingApiRow[];
  returns: TodayBookingApiRow[];
  tasks: ApiTask[];
  fleetVehicles: VehicleData[];
  healthMap: Map<string, VehicleHealthResponse>;
  locale?: string;
}): OperatorTodaySnapshot {
  const locale = input.locale ?? 'de';
  const nowMs = Date.now();

  const pickupsToday = input.pickups
    .map((r) => mapPickupRow(r, input.healthMap, locale, nowMs))
    .filter((x): x is OperatorTodayBookingItem => x !== null);

  const returnsToday = input.returns
    .map((r) => mapReturnRow(r, locale, nowMs))
    .filter((x): x is OperatorTodayBookingItem => x !== null);

  const dueNow = [...pickupsToday, ...returnsToday]
    .filter((item) => !item.isDone && item.isDueNow)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const openTasks = [...input.tasks].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });

  const vehicleCheckTasks = openTasks.filter(
    (t) => CHECK_TASK_TYPES.has(t.type) || t.blocksVehicleAvailability,
  );

  const blockedVehicles: OperatorBlockedVehicleItem[] = [];
  for (const v of input.fleetVehicles) {
    const h = input.healthMap.get(v.id);
    if (!h?.rental_blocked) continue;
    blockedVehicles.push({
      vehicleId: v.id,
      label: [v.model, v.make].filter(Boolean).join(' ').trim() || v.model,
      plate: v.license,
      station: v.station ?? '',
      reasons: h.blocking_reasons ?? [],
    });
  }

  return {
    dueNow,
    pickupsToday,
    returnsToday,
    openTasks: openTasks.slice(0, 8),
    vehicleCheckTasks: vehicleCheckTasks.slice(0, 6),
    blockedVehicles,
  };
}

export function toHandoverBookingSeed(item: OperatorTodayBookingItem) {
  return {
    id: item.bookingId,
    vehicleId: item.vehicleId,
    customerId: item.customerId ?? item.raw.customerId ?? null,
    vehicleName: item.vehicleName,
    plate: item.plate,
    customerName: item.customerName,
    startDate: item.raw.startDate ?? '',
    endDate: item.raw.endDate ?? '',
    pickupLocation: item.kind === 'PICKUP' ? item.station : item.raw.pickupStationName ?? '',
    returnLocation: item.kind === 'RETURN' ? item.station : item.raw.returnStationName ?? '',
    pickupStationId: item.raw.pickupStationId,
    returnStationId: item.raw.returnStationId,
    status: item.raw.status,
  };
}

/** Map scan/search booking hit → detail sheet item (gates filled after `api.bookings.detail`). */
export function mapScanBookingToDetailItem(
  hit: OperatorScanBookingHit,
  locale = 'de',
): OperatorTodayBookingItem {
  const status = normalizeBookingStatus(hit.statusEnum, hit.status);
  const startIso = hit.startDate ?? '';
  const endIso = hit.endDate ?? '';
  const nowMs = Date.now();
  const endMs = endIso ? new Date(endIso).getTime() : NaN;
  const kind: OperatorHandoverKind =
    Number.isFinite(endMs) && endMs <= nowMs + 2 * 60 * 60 * 1000 ? 'RETURN' : 'PICKUP';
  const scheduledAt = kind === 'RETURN' && endIso ? endIso : startIso;
  const raw: TodayBookingApiRow = {
    id: hit.bookingId,
    vehicleId: hit.vehicleId,
    vehicleName: hit.vehicleName,
    vehicleLicense: hit.plate,
    customerName: hit.customerName,
    startDate: startIso,
    endDate: endIso,
    status: hit.status,
    statusEnum: hit.statusEnum,
  };
  return {
    bookingId: hit.bookingId,
    kind,
    vehicleId: hit.vehicleId,
    vehicleName: hit.vehicleName,
    plate: hit.plate,
    customerName: hit.customerName,
    station: '',
    scheduledAt,
    timeLabel: formatApiTime(scheduledAt, locale) || '—',
    status,
    statusLabel: bookingStatusLabel(status),
    isOverdue: false,
    isDueNow: false,
    isDone: false,
    pickupGate: { allowed: false },
    returnGate: { allowed: false },
    raw,
  };
}
