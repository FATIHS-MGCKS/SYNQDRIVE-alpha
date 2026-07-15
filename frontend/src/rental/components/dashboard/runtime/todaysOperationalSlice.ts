import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import { de } from '../../../i18n/translations/de';
import { en, type TranslationKey } from '../../../i18n/translations/en';
import type { VehicleRuntimeState } from './dashboardRuntimeTypes';

/** Stable group ids inside the `active-rented` (Today's Operations) runtime slice. */
export const TODAYS_OPERATIONAL_GROUP_IDS = {
  ACTIVE_RENTED_NOW: 'active-rented-now',
  PICKUPS_TODAY: 'pickups-today',
  RESERVED_PICKUP_TODAY: 'reserved-pickup-today',
  RETURNS_TODAY: 'returns-today',
  OVERDUE_PICKUPS: 'overdue-pickups',
  OVERDUE_RETURNS: 'overdue-returns',
} as const;

export type TodaysOperationalGroupId =
  (typeof TODAYS_OPERATIONAL_GROUP_IDS)[keyof typeof TODAYS_OPERATIONAL_GROUP_IDS];

export interface TodaysOperationalPickupEntry {
  item: PickupTileItem;
  state: VehicleRuntimeState | undefined;
}

export interface TodaysOperationalReturnEntry {
  item: ReturnTileItem;
  state: VehicleRuntimeState | undefined;
}

/**
 * Fachliche Klassifikation für Heutige Operationen.
 *
 * Mehrfachzugehörigkeit (erlaubt):
 * - Ein Fahrzeug mit kanonischem `active_rented` und Rückgabe heute erscheint in
 *   `active-rented-now` UND `returns-today` (bzw. `overdue-returns` bei Überfälligkeit).
 * - Ein reserviertes Fahrzeug mit Übergabe heute erscheint in `pickups-today` UND
 *   `reserved-pickup-today`.
 *
 * Keine Doppelzählung innerhalb desselben Teilwerts (Dedupe pro Gruppe nach Buchung/Fahrzeug).
 */
export interface ClassifiedTodaysOperational {
  activeRentedNow: VehicleRuntimeState[];
  pickupsToday: TodaysOperationalPickupEntry[];
  reservedPickupToday: TodaysOperationalPickupEntry[];
  returnsToday: TodaysOperationalReturnEntry[];
  overduePickups: TodaysOperationalPickupEntry[];
  overdueReturns: TodaysOperationalReturnEntry[];
}

function parseTimeMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Calendar-day match against dashboard `now` (items are pre-filtered by org TZ on the API). */
export function isScheduledToday(iso: string | undefined, now: Date): boolean {
  const ms = parseTimeMs(iso);
  if (ms == null) return false;
  const scheduled = new Date(ms);
  return (
    scheduled.getFullYear() === now.getFullYear()
    && scheduled.getMonth() === now.getMonth()
    && scheduled.getDate() === now.getDate()
  );
}

function findVehicleState(
  states: VehicleRuntimeState[],
  item: PickupTileItem | ReturnTileItem,
): VehicleRuntimeState | undefined {
  return states.find((state) => {
    if (item.vehicleId && item.vehicleId === state.vehicleId) return true;
    return !!item.plate && !!state.license && item.plate === state.license;
  });
}

function byVehicleLabel(a: VehicleRuntimeState, b: VehicleRuntimeState): number {
  return (a.license || a.displayName).localeCompare(b.license || b.displayName);
}

function dedupePickups(entries: TodaysOperationalPickupEntry[]): TodaysOperationalPickupEntry[] {
  const seen = new Set<string>();
  const result: TodaysOperationalPickupEntry[] = [];
  for (const entry of entries) {
    const key = entry.item.bookingId
      ? `booking:${entry.item.bookingId}`
      : `vehicle:${entry.item.vehicleId || entry.item.plate || entry.item.bookingId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function dedupeReturns(entries: TodaysOperationalReturnEntry[]): TodaysOperationalReturnEntry[] {
  const seen = new Set<string>();
  const result: TodaysOperationalReturnEntry[] = [];
  for (const entry of entries) {
    const key = entry.item.bookingId
      ? `booking:${entry.item.bookingId}`
      : `vehicle:${entry.item.vehicleId || entry.item.plate || entry.item.bookingId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function isOpenPickupToday(item: PickupTileItem, now: Date): boolean {
  return !item.done && isScheduledToday(item.startDate, now);
}

function isOpenReturnToday(item: ReturnTileItem, now: Date): boolean {
  return !item.done && isScheduledToday(item.endDate, now);
}

export function classifyTodaysOperational(input: {
  vehicleStates: VehicleRuntimeState[];
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  now: Date;
}): ClassifiedTodaysOperational {
  const { vehicleStates, pickupItems, returnItems, now } = input;

  const activeRentedNow = vehicleStates
    .filter((state) => state.operationalStatus === 'active_rented')
    .sort(byVehicleLabel);

  const pickupsToday: TodaysOperationalPickupEntry[] = [];
  const reservedPickupToday: TodaysOperationalPickupEntry[] = [];
  const overduePickups: TodaysOperationalPickupEntry[] = [];
  const returnsToday: TodaysOperationalReturnEntry[] = [];
  const overdueReturns: TodaysOperationalReturnEntry[] = [];

  for (const item of pickupItems) {
    if (item.done) continue;
    const state = findVehicleState(vehicleStates, item);
    const entry: TodaysOperationalPickupEntry = { item, state };

    if (item.isOverdue) {
      overduePickups.push(entry);
      continue;
    }

    if (!isOpenPickupToday(item, now)) continue;

    pickupsToday.push(entry);
    if (state?.operationalStatus === 'reserved') {
      reservedPickupToday.push(entry);
    }
  }

  for (const item of returnItems) {
    if (item.done) continue;
    const state = findVehicleState(vehicleStates, item);
    const entry: TodaysOperationalReturnEntry = { item, state };

    if (item.isOverdue) {
      overdueReturns.push(entry);
      continue;
    }

    if (!isOpenReturnToday(item, now)) continue;
    returnsToday.push(entry);
  }

  return {
    activeRentedNow,
    pickupsToday: dedupePickups(pickupsToday),
    reservedPickupToday: dedupePickups(reservedPickupToday),
    returnsToday: dedupeReturns(returnsToday),
    overduePickups: dedupePickups(overduePickups),
    overdueReturns: dedupeReturns(overdueReturns),
  };
}

export function todaysOperationalGroupLabel(groupId: TodaysOperationalGroupId, locale: string): string {
  const keyByGroup: Record<TodaysOperationalGroupId, TranslationKey> = {
    [TODAYS_OPERATIONAL_GROUP_IDS.ACTIVE_RENTED_NOW]: 'dashboard.todaysOperations.activeRentedNow',
    [TODAYS_OPERATIONAL_GROUP_IDS.PICKUPS_TODAY]: 'dashboard.todaysOperations.pickupsToday',
    [TODAYS_OPERATIONAL_GROUP_IDS.RESERVED_PICKUP_TODAY]: 'dashboard.todaysOperations.reservedPickupToday',
    [TODAYS_OPERATIONAL_GROUP_IDS.RETURNS_TODAY]: 'dashboard.todaysOperations.returnsToday',
    [TODAYS_OPERATIONAL_GROUP_IDS.OVERDUE_PICKUPS]: 'dashboard.todaysOperations.overduePickups',
    [TODAYS_OPERATIONAL_GROUP_IDS.OVERDUE_RETURNS]: 'dashboard.todaysOperations.overdueReturns',
  };
  const key = keyByGroup[groupId];
  const dict = locale === 'de' ? de : en;
  return dict[key] ?? en[key] ?? groupId;
}
