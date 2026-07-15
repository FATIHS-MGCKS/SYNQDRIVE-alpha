import type { StatusTone } from '../../components/patterns';
import type { BookingUiStatus } from '../components/bookings/bookingStatus';
import type { VehicleData } from '../data/vehicles';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import {
  calculateUtilization,
  formatSlotDurationLabel,
  getNextFreeSlot,
} from './vehicle-availability-intelligence.utils';

export type VehicleOperatorState = 'blocked' | 'overdue' | 'active' | 'reserved' | 'available';

export interface VehicleBookingHorizon {
  start: Date;
  end: Date;
  totalMs: number;
}

export interface VehicleBookingOperatorInput {
  id: string;
  customerName: string;
  status: BookingUiStatus;
  startDate: Date;
  endDate: Date;
  pickupLocation: string;
  returnLocation: string;
  totalPriceCents: number | null;
}

export interface VehicleBookingOperatorSnapshot {
  operatorState: VehicleOperatorState;
  operatorLabel: string;
  operatorNowLabel: string;
  operatorTone: StatusTone;
  operatorDetail: string;
  activeBooking: VehicleBookingOperatorInput | null;
  nextPickup: VehicleBookingOperatorInput | null;
  nextReturn: VehicleBookingOperatorInput | null;
  utilizationPct: number;
  forecastUtilizationPct: number;
  realizedUtilizationPct: number;
  freeDays: number;
  freeHours: number;
  nextFreeSlotLabel: string | null;
  bookedRevenueCents: number;
  realizedRevenueCents: number;
  pipelineRevenueCents: number;
}

const NON_UTILIZATION: BookingUiStatus[] = ['cancelled', 'no_show'];
const PIPELINE_STATUSES: BookingUiStatus[] = ['pending', 'confirmed'];
const REALIZED_STATUSES: BookingUiStatus[] = ['active', 'completed'];

export function isVehicleOperationallyBlocked(vehicle?: VehicleData | null): boolean {
  if (!vehicle) return false;
  if (vehicle.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) return true;
  return vehicle.maintenanceReasonCode === 'OPERATIONAL_BLOCK';
}

function isActiveNow(booking: VehicleBookingOperatorInput, now: number): boolean {
  if (booking.status !== 'active') return false;
  return now >= booking.startDate.getTime() && now <= booking.endDate.getTime() + 60_000;
}

function isOverdueActive(booking: VehicleBookingOperatorInput, now: number): boolean {
  if (booking.status !== 'active') return false;
  return booking.endDate.getTime() < now;
}

function findActiveBooking(
  bookings: VehicleBookingOperatorInput[],
  now: number,
): VehicleBookingOperatorInput | null {
  const active = bookings.find((b) => isActiveNow(b, now));
  if (active) return active;
  return bookings.find((b) => b.status === 'active') ?? null;
}

function findNextPickup(
  bookings: VehicleBookingOperatorInput[],
  now: number,
): VehicleBookingOperatorInput | null {
  return (
    bookings
      .filter((b) => PIPELINE_STATUSES.includes(b.status) && b.startDate.getTime() > now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? null
  );
}

function findNextReturn(
  bookings: VehicleBookingOperatorInput[],
  active: VehicleBookingOperatorInput | null,
  now: number,
): VehicleBookingOperatorInput | null {
  if (active) return active;
  const upcoming = bookings
    .filter(
      (b) =>
        !NON_UTILIZATION.includes(b.status) &&
        b.endDate.getTime() > now &&
        PIPELINE_STATUSES.includes(b.status),
    )
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
  return upcoming[0] ?? null;
}

function sumRevenue(
  bookings: VehicleBookingOperatorInput[],
  statuses: BookingUiStatus[],
): number {
  return bookings
    .filter((b) => statuses.includes(b.status))
    .reduce((sum, b) => sum + (b.totalPriceCents ?? 0), 0);
}

export function deriveVehicleBookingOperatorSnapshot(
  bookings: VehicleBookingOperatorInput[],
  horizon: VehicleBookingHorizon,
  vehicle?: VehicleData | null,
  now = Date.now(),
): VehicleBookingOperatorSnapshot {
  const blocked = isVehicleOperationallyBlocked(vehicle);
  const activeBooking = findActiveBooking(bookings, now);
  const fleetActive =
    vehicle?.status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED || Boolean(vehicle?.activeBookingId);
  const fleetReserved = vehicle?.status === VEHICLE_OPERATIONAL_STATUS.RESERVED;
  const fleetOverdue =
    vehicle?.activeIsOverdue === true || vehicle?.reservedIsOverdue === true;

  const overdueBooking =
    activeBooking && (isOverdueActive(activeBooking, now) || vehicle?.activeIsOverdue === true)
      ? activeBooking
      : bookings.find((b) => isOverdueActive(b, now)) ?? null;
  const nextPickup = findNextPickup(bookings, now);
  const nextReturn = findNextReturn(bookings, activeBooking, now);

  const utilization = calculateUtilization(bookings, horizon);
  const utilizationPct = utilization.occupancyPct;
  const nextFreeSlot = getNextFreeSlot(bookings, horizon, now);
  const bookedRevenueCents = bookings
    .filter((b) => !NON_UTILIZATION.includes(b.status))
    .reduce((sum, b) => sum + (b.totalPriceCents ?? 0), 0);
  const realizedRevenueCents = sumRevenue(bookings, REALIZED_STATUSES);
  const pipelineRevenueCents = sumRevenue(bookings, PIPELINE_STATUSES);

  let operatorState: VehicleOperatorState = 'available';
  let operatorLabel = 'Frei';
  let operatorNowLabel = 'Frei';
  let operatorTone: StatusTone = 'success';
  let operatorDetail = 'Keine aktive oder unmittelbar bevorstehende Buchung im Horizont.';

  if (blocked) {
    operatorState = 'blocked';
    operatorLabel = 'Blockiert';
    operatorNowLabel = 'Blockiert';
    operatorTone = 'critical';
    operatorDetail =
      vehicle?.maintenanceReason?.trim() ||
      'Fahrzeug ist für Vermietung gesperrt (Wartung/operativer Block).';
  } else if (overdueBooking || (fleetOverdue && (fleetActive || fleetReserved))) {
    operatorState = 'overdue';
    operatorLabel = 'Überfällig';
    operatorNowLabel = 'Überfällig';
    operatorTone = 'critical';
    operatorDetail = overdueBooking
      ? `Rückgabe überfällig · ${overdueBooking.customerName}`
      : vehicle?.activeCustomerName || vehicle?.reservedCustomerName
        ? `Rückgabe überfällig · ${vehicle.activeCustomerName ?? vehicle.reservedCustomerName}`
        : 'Rückgabe überfällig laut Fahrzeugstatus.';
  } else if (activeBooking || fleetActive) {
    operatorState = 'active';
    operatorLabel = 'Aktiv vermietet';
    operatorNowLabel = 'Aktiv';
    operatorTone = 'info';
    if (activeBooking) {
      operatorDetail = `${activeBooking.customerName} · Rückgabe ${formatOperatorDateTime(activeBooking.endDate)}`;
    } else if (vehicle?.activeReturnAt) {
      const returnAt = new Date(vehicle.activeReturnAt);
      operatorDetail = `${vehicle.activeCustomerName ?? 'Aktiver Kunde'} · Rückgabe ${formatOperatorDateTime(returnAt)}`;
    } else {
      operatorDetail = vehicle?.activeCustomerName
        ? `Aktiv vermietet · ${vehicle.activeCustomerName}`
        : 'Fahrzeug ist aktuell vermietet.';
    }
  } else if (nextPickup || fleetReserved) {
    operatorState = 'reserved';
    operatorLabel = 'Reserviert';
    operatorNowLabel = 'Reserviert';
    operatorTone = 'watch';
    if (nextPickup) {
      operatorDetail = `Nächster Pickup ${formatOperatorDateTime(nextPickup.startDate)} · ${nextPickup.customerName}`;
    } else if (vehicle?.reservedPickupAt) {
      const pickupAt = new Date(vehicle.reservedPickupAt);
      operatorDetail = `Nächster Pickup ${formatOperatorDateTime(pickupAt)} · ${vehicle.reservedCustomerName ?? 'Reservierung'}`;
    } else {
      operatorDetail = vehicle?.reservedCustomerName
        ? `Reserviert · ${vehicle.reservedCustomerName}`
        : 'Fahrzeug ist reserviert.';
    }
  }

  return {
    operatorState,
    operatorLabel,
    operatorNowLabel,
    operatorTone,
    operatorDetail,
    activeBooking,
    nextPickup,
    nextReturn,
    utilizationPct,
    forecastUtilizationPct: utilization.forecastPct,
    realizedUtilizationPct: utilization.realizedPct,
    freeDays: utilization.freeDays,
    freeHours: utilization.freeHours,
    nextFreeSlotLabel: nextFreeSlot
      ? `${formatSlotDurationLabel(nextFreeSlot.durationMs)} ab ${formatOperatorDate(nextFreeSlot.start)}`
      : null,
    bookedRevenueCents,
    realizedRevenueCents,
    pipelineRevenueCents,
  };
}

export function formatOperatorDateTime(date: Date): string {
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatOperatorDate(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatOperatorTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
