import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import type { OperatorTodayFeedState } from '../hooks/operatorTodayFeed.utils';
import { bucketCount, OPERATOR_TASKS_ALL_OPEN_BUCKET } from '../hooks/operatorTodayFeed.utils';
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
  type BookingHandoverGate,
} from '../../rental/lib/bookingHandoverGates';
import {
  inferTodayHandoverKind,
  mapBookingListRowToTodayRow,
  resolveTodayCustomerName,
  resolveTodayStationLabel,
  resolveTodayVehicleDisplay,
  scheduledAtForTodayKind,
  type TodayHandoverKind,
} from '../../rental/lib/today-booking-contract';
import { buildOperatorTodayWorkQueue } from './operatorTodayWorkQueue';
import {
  deriveOperatorTodayWorkState,
  type OperatorTodayWorkState,
} from './operatorTodayWorkQueue';
import { buildOperatorVehicleRuntimeState } from './operatorVehicleRuntime';
import type { OperatorScanBookingHit } from '../hooks/useOperatorScanSearch';

export type { OperatorTodayWorkState } from './operatorTodayWorkQueue';

export type OperatorHandoverKind = TodayHandoverKind;

export type OperatorActionGate = BookingHandoverGate;

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
  /** True when server marks overdue — no client-side 2h window. */
  isDueNow: boolean;
  isDone: boolean;
  workState: OperatorTodayWorkState;
  blockerReason?: string;
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
  overduePickups: OperatorTodayBookingItem[];
  overdueReturns: OperatorTodayBookingItem[];
  pickupsToday: OperatorTodayBookingItem[];
  returnsToday: OperatorTodayBookingItem[];
  /** Overdue handovers only — for NOW feed extras (no overlap with today lists). */
  urgentHandovers: OperatorTodayBookingItem[];
  /** @deprecated Use `urgentHandovers` — kept for transitional callers. */
  dueNow: OperatorTodayBookingItem[];
  totalOpenTasksCount: number;
  blockedVehicles: OperatorBlockedVehicleItem[];
  taskFeed: OperatorTodayFeedState;
  orgTimezone: string;
}

export { normalizeBookingList as normalizeTodayRows } from '../../rental/components/dashboard/dashboardUtils';

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

function mapTodayRowToOperatorItem(
  row: TodayBookingApiRow,
  kind: OperatorHandoverKind,
  locale: string,
  nowMs: number,
  gates: { pickupGate: OperatorActionGate; returnGate: OperatorActionGate },
): OperatorTodayBookingItem | null {
  const bookingId = String(row.id ?? '');
  if (!bookingId) return null;

  const status = normalizeBookingStatus(row.statusEnum, row.status);
  const scheduledAt = scheduledAtForTodayKind(row, kind);
  const isDone =
    kind === 'PICKUP' ? Boolean(row.pickupProtocol) : Boolean(row.returnProtocol);
  const isOverdue = Boolean(row.isOverdue);
  const { vehicleName, plate } = resolveTodayVehicleDisplay(row);

  return {
    bookingId,
    kind,
    vehicleId: String(row.vehicleId ?? ''),
    customerId: row.customerId ?? null,
    vehicleName,
    plate,
    customerName: resolveTodayCustomerName(row),
    station: resolveTodayStationLabel(row, kind),
    scheduledAt,
    timeLabel: formatApiTime(scheduledAt, locale) || '—',
    status,
    statusLabel: bookingStatusLabel(status),
    isOverdue,
    isDueNow: isOverdue,
    isDone,
    workState: 'bereit',
    pickupGate: gates.pickupGate,
    returnGate: gates.returnGate,
    raw: row,
  };
}

export function mapPickupRow(
  row: TodayBookingApiRow,
  healthMap: Map<string, VehicleHealthResponse>,
  locale: string,
  nowMs: number,
): OperatorTodayBookingItem | null {
  return mapTodayRowToOperatorItem(
    row,
    'PICKUP',
    locale,
    nowMs,
    {
      pickupGate: derivePickupGate(row, healthMap),
      returnGate: { allowed: false, reason: 'Kein Return bei Abholung' },
    },
  );
}

export function mapReturnRow(
  row: TodayBookingApiRow,
  locale: string,
  nowMs: number,
): OperatorTodayBookingItem | null {
  return mapTodayRowToOperatorItem(
    row,
    'RETURN',
    locale,
    nowMs,
    {
      pickupGate: { allowed: false, reason: 'Kein Pickup bei Rückgabe' },
      returnGate: deriveReturnGate(row),
    },
  );
}

export function buildOperatorTodaySnapshot(input: {
  pickups: TodayBookingApiRow[];
  returns: TodayBookingApiRow[];
  taskFeed: OperatorTodayFeedState;
  fleetVehicles: VehicleData[];
  healthMap: Map<string, VehicleHealthResponse>;
  locale?: string;
  orgTimezone?: string | null;
  referenceNow?: Date;
}): OperatorTodaySnapshot {
  const locale = input.locale ?? 'de';
  const workQueue = buildOperatorTodayWorkQueue({
    pickups: input.pickups,
    returns: input.returns,
    fleetVehicles: input.fleetVehicles,
    healthMap: input.healthMap,
    locale,
    orgTimezone: input.orgTimezone ?? input.taskFeed.timezone,
    referenceNow: input.referenceNow,
  });

  const totalOpenTasksCount = bucketCount(
    input.taskFeed.summary,
    OPERATOR_TASKS_ALL_OPEN_BUCKET,
    0,
  );

  const blockedVehicles: OperatorBlockedVehicleItem[] = [];
  for (const v of input.fleetVehicles) {
    const health = input.healthMap.get(v.id);
    const runtime = buildOperatorVehicleRuntimeState({
      vehicle: v,
      health,
      healthMap: input.healthMap,
      locale,
      now: workQueue.referenceNow,
    });
    if (!runtime.isBlocked) continue;
    const primaryReason =
      runtime.blockReasons[0]?.title ??
      health?.blocking_reasons?.[0] ??
      'Vermietung blockiert';
    blockedVehicles.push({
      vehicleId: v.id,
      label: [v.model, v.make].filter(Boolean).join(' ').trim() || v.model,
      plate: v.license,
      station: v.station ?? '',
      reasons: runtime.blockReasons.length
        ? runtime.blockReasons.map((reason) => reason.title)
        : [primaryReason],
    });
  }

  return {
    overduePickups: workQueue.overduePickups,
    overdueReturns: workQueue.overdueReturns,
    pickupsToday: workQueue.pickupsToday,
    returnsToday: workQueue.returnsToday,
    urgentHandovers: workQueue.urgentHandovers,
    dueNow: workQueue.urgentHandovers,
    totalOpenTasksCount,
    blockedVehicles,
    taskFeed: input.taskFeed,
    orgTimezone: workQueue.orgTimezone,
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
  nowMs = Date.now(),
): OperatorTodayBookingItem {
  const raw =
    hit.todayRow ??
    mapBookingListRowToTodayRow({
      id: hit.bookingId,
      vehicleId: hit.vehicleId,
      vehicleName: hit.vehicleName,
      vehicleLicense: hit.plate,
      customerName: hit.customerName,
      startDate: hit.startDate,
      endDate: hit.endDate,
      status: hit.status,
      statusEnum: hit.statusEnum,
      pickupProtocol: hit.pickupProtocol,
      returnProtocol: hit.returnProtocol,
      isOverdue: hit.isOverdue,
      pickupStationName: hit.pickupStationName,
      returnStationName: hit.returnStationName,
      pickupStationId: hit.pickupStationId,
      returnStationId: hit.returnStationId,
      stationLabel: hit.stationLabel,
      station: hit.station,
    }) ?? {
      id: hit.bookingId,
      vehicleId: hit.vehicleId,
      vehicleName: hit.vehicleName,
      vehicleLicense: hit.plate,
      customerName: hit.customerName,
      startDate: hit.startDate,
      endDate: hit.endDate,
      status: hit.status,
      statusEnum: hit.statusEnum,
    };

  const kind = inferTodayHandoverKind(raw, nowMs);
  const scheduledAt = scheduledAtForTodayKind(raw, kind);
  const status = normalizeBookingStatus(raw.statusEnum, raw.status);
  const { vehicleName, plate } = resolveTodayVehicleDisplay(raw);
  const isOverdue = Boolean(raw.isOverdue);
  const isDone =
    kind === 'PICKUP' ? Boolean(raw.pickupProtocol) : Boolean(raw.returnProtocol);

  const pickupGate = { allowed: false as const };
  const returnGate = { allowed: false as const };
  const { workState, blockerReason } = deriveOperatorTodayWorkState({
    kind,
    isDone,
    isOverdue,
    raw,
    pickupGate,
    returnGate,
  });

  return {
    bookingId: hit.bookingId,
    kind,
    vehicleId: hit.vehicleId,
    customerId: raw.customerId ?? null,
    vehicleName,
    plate,
    customerName: resolveTodayCustomerName(raw),
    station: resolveTodayStationLabel(raw, kind),
    scheduledAt,
    timeLabel: formatApiTime(scheduledAt, locale) || '—',
    status,
    statusLabel: bookingStatusLabel(status),
    isOverdue,
    isDueNow: isOverdue,
    isDone,
    workState,
    blockerReason,
    pickupGate,
    returnGate,
    raw,
  };
}

export { mapBookingListRowToTodayRow } from '../../rental/lib/today-booking-contract';
