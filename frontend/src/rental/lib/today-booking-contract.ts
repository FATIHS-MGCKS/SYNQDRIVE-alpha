import type { TodayBookingApiRow } from '../components/dashboard/dashboardTypes';
import {
  normalizeBookingStatus,
  type BookingUiStatus,
} from '../components/bookings/bookingStatus';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OPERATOR_DUE_NOW_WINDOW_MS = 2 * 60 * 60 * 1000;

export type TodayHandoverKind = 'PICKUP' | 'RETURN';

function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isTerminalBookingUiStatus(status: BookingUiStatus): boolean {
  return status === 'cancelled' || status === 'no_show' || status === 'completed';
}

/** Operational today lists exclude terminal lifecycle states. */
export function isOperatorOperationalTodayRow(row: TodayBookingApiRow): boolean {
  const status = normalizeBookingStatus(row.statusEnum, row.status);
  return !isTerminalBookingUiStatus(status);
}

export function filterOperatorOperationalTodayRows(rows: TodayBookingApiRow[]): TodayBookingApiRow[] {
  return rows.filter(isOperatorOperationalTodayRow);
}

export function resolveTodayVehicleName(row: Pick<TodayBookingApiRow, 'vehicleName'>): string {
  const name = readString(row.vehicleName);
  if (!name || isUuidLike(name)) return '';
  return name;
}

export function resolveTodayVehiclePlate(row: Pick<TodayBookingApiRow, 'vehicleLicense'>): string {
  return readString(row.vehicleLicense) ?? '';
}

export function resolveTodayVehicleDisplay(
  row: Pick<TodayBookingApiRow, 'vehicleName' | 'vehicleLicense'>,
): { vehicleName: string; plate: string } {
  const plate = resolveTodayVehiclePlate(row);
  const name = resolveTodayVehicleName(row);
  return {
    vehicleName: name || plate || 'Fahrzeug ohne Bezeichnung',
    plate,
  };
}

export function resolveTodayCustomerName(row: Pick<TodayBookingApiRow, 'customerName'>): string {
  const name = readString(row.customerName);
  if (!name || isUuidLike(name)) return '';
  return name;
}

export function resolveTodayStationLabel(
  row: TodayBookingApiRow,
  kind: TodayHandoverKind,
): string {
  if (kind === 'PICKUP') {
    return (
      readString(row.pickupStationName) ??
      readString(row.stationLabel) ??
      readString(row.station) ??
      ''
    );
  }
  return (
    readString(row.returnStationName) ??
    readString(row.stationLabel) ??
    readString(row.station) ??
    ''
  );
}

export function isDueWithinWindow(
  iso: string | undefined,
  nowMs: number,
  windowMs = OPERATOR_DUE_NOW_WINDOW_MS,
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs + windowMs;
}

/** Status/protocol-first; time window only as fallback — no invented booking states. */
export function inferTodayHandoverKind(
  row: TodayBookingApiRow,
  nowMs = Date.now(),
): TodayHandoverKind {
  const status = normalizeBookingStatus(row.statusEnum, row.status);
  const hasPickup = Boolean(row.pickupProtocol);
  const hasReturn = Boolean(row.returnProtocol);

  if (status === 'active') {
    if (hasPickup && !hasReturn) return 'RETURN';
    return 'RETURN';
  }

  if (status === 'confirmed' || status === 'pending') {
    if (!hasPickup) return 'PICKUP';
  }

  const endIso = readString(row.endDate);
  const endMs = endIso ? new Date(endIso).getTime() : NaN;
  if (Number.isFinite(endMs) && !hasReturn && isDueWithinWindow(endIso, nowMs)) {
    return 'RETURN';
  }

  return 'PICKUP';
}

export function scheduledAtForTodayKind(
  row: TodayBookingApiRow,
  kind: TodayHandoverKind,
): string {
  if (kind === 'RETURN') return readString(row.endDate) ?? readString(row.startDate) ?? '';
  return readString(row.startDate) ?? readString(row.endDate) ?? '';
}

/** Map list/get booking payload → canonical today row (no unchecked casts at call sites). */
export function mapBookingListRowToTodayRow(row: unknown): TodayBookingApiRow | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const id = readString(record.id) ?? readString(record.bookingId);
  if (!id) return null;

  const vehicleId = readString(record.vehicleId) ?? '';
  const vehicleLicense =
    readString(record.vehicleLicense) ??
    readString(record.licensePlate) ??
    readString(record.plate) ??
    '';
  const vehicleName =
    readString(record.vehicleName) ?? readString(record.vehicleModel) ?? '';

  return {
    id,
    vehicleId,
    customerId: readString(record.customerId) ?? null,
    vehicleLicense,
    vehicleName,
    customerName: readString(record.customerName) ?? '',
    startDate: readString(record.startDate),
    endDate: readString(record.endDate),
    pickupStationId: readString(record.pickupStationId) ?? undefined,
    returnStationId: readString(record.returnStationId) ?? undefined,
    pickupStationName: readString(record.pickupStationName),
    returnStationName: readString(record.returnStationName),
    stationLabel: readString(record.stationLabel),
    station: readString(record.station),
    pickupProtocol: record.pickupProtocol,
    returnProtocol: record.returnProtocol,
    isOverdue: record.isOverdue === true,
    minutesOverdue:
      typeof record.minutesOverdue === 'number' ? record.minutesOverdue : undefined,
    status: readString(record.status),
    statusEnum: readString(record.statusEnum),
  };
}
