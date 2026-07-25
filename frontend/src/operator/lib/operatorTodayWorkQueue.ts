import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import type { PickupTileItem, ReturnTileItem } from '../../rental/components/StatInlineDetail';
import {
  buildVehicleLookup,
  mapPickupItems,
  mapReturnItems,
} from '../../rental/components/dashboard/dashboardUtils';
import { classifyTodaysOperational } from '../../rental/components/dashboard/runtime/todaysOperationalSlice';
import { buildVehicleRuntimeStates } from '../../rental/components/dashboard/runtime/vehicleRuntimeStateBuilder';
import type { VehicleRuntimeState } from '../../rental/components/dashboard/runtime/dashboardRuntimeTypes';
import { DEFAULT_ORG_TIMEZONE } from '../../rental/lib/org-calendar';
import {
  filterOperatorOperationalTodayRows,
  type TodayHandoverKind,
} from '../../rental/lib/today-booking-contract';
import type { BookingHandoverGate } from '../../rental/lib/bookingHandoverGates';
import type { OperatorTodayBookingItem } from './operatorData';
import {
  derivePickupGate,
  deriveReturnGate,
  mapPickupRow,
  mapReturnRow,
} from './operatorData';

export type OperatorTodayWorkState =
  | 'bereit'
  | 'in_bearbeitung'
  | 'blockiert'
  | 'verspaetet'
  | 'abgeschlossen';

export const OPERATOR_TODAY_WORK_STATE_LABELS: Record<OperatorTodayWorkState, string> = {
  bereit: 'Bereit',
  in_bearbeitung: 'In Bearbeitung',
  blockiert: 'Blockiert',
  verspaetet: 'Verspätet',
  abgeschlossen: 'Abgeschlossen',
};

/** Lower rank = higher priority in stable sort. */
export const OPERATOR_TODAY_WORK_STATE_RANK: Record<OperatorTodayWorkState, number> = {
  verspaetet: 0,
  blockiert: 1,
  in_bearbeitung: 2,
  bereit: 3,
  abgeschlossen: 4,
};

export interface OperatorTodayWorkQueue {
  overduePickups: OperatorTodayBookingItem[];
  overdueReturns: OperatorTodayBookingItem[];
  pickupsToday: OperatorTodayBookingItem[];
  returnsToday: OperatorTodayBookingItem[];
  /** Merged overdue handovers for NOW section — no overlap with today lists. */
  urgentHandovers: OperatorTodayBookingItem[];
  orgTimezone: string;
  referenceNow: Date;
}

function protocolIndicatesInProgress(protocol: unknown): boolean {
  if (!protocol || typeof protocol !== 'object') return false;
  const status = String((protocol as { status?: string }).status ?? '').toUpperCase();
  return status === 'DRAFT' || status === 'IN_PROGRESS';
}

function activeGateForKind(
  kind: TodayHandoverKind,
  gates: { pickupGate: BookingHandoverGate; returnGate: BookingHandoverGate },
): BookingHandoverGate {
  return kind === 'PICKUP' ? gates.pickupGate : gates.returnGate;
}

export function deriveOperatorTodayWorkState(input: {
  kind: TodayHandoverKind;
  isDone: boolean;
  isOverdue: boolean;
  raw: TodayBookingApiRow;
  pickupGate: BookingHandoverGate;
  returnGate: BookingHandoverGate;
  runtime?: VehicleRuntimeState;
}): { workState: OperatorTodayWorkState; blockerReason?: string } {
  if (input.isDone) {
    return { workState: 'abgeschlossen' };
  }

  if (input.isOverdue) {
    return { workState: 'verspaetet' };
  }

  const protocol =
    input.kind === 'PICKUP' ? input.raw.pickupProtocol : input.raw.returnProtocol;
  if (protocolIndicatesInProgress(protocol)) {
    return { workState: 'in_bearbeitung' };
  }

  const gate = activeGateForKind(input.kind, {
    pickupGate: input.pickupGate,
    returnGate: input.returnGate,
  });

  if (input.kind === 'PICKUP' && input.runtime?.isBlocked) {
    const runtimeReason = input.runtime.blockReasons[0]?.title;
    return {
      workState: 'blockiert',
      blockerReason: runtimeReason ?? gate.reason ?? 'Fahrzeug blockiert',
    };
  }

  if (!gate.allowed) {
    return {
      workState: 'blockiert',
      blockerReason: gate.reason ?? 'Aktion derzeit nicht möglich',
    };
  }

  return { workState: 'bereit' };
}

function findRowByBookingId(
  rows: TodayBookingApiRow[],
  bookingId: string | undefined,
): TodayBookingApiRow | undefined {
  if (!bookingId) return undefined;
  return rows.find((row) => String(row.id ?? '') === bookingId);
}

function enrichOperatorTodayItem(
  base: OperatorTodayBookingItem,
  runtime: VehicleRuntimeState | undefined,
): OperatorTodayBookingItem {
  const { workState, blockerReason } = deriveOperatorTodayWorkState({
    kind: base.kind,
    isDone: base.isDone,
    isOverdue: base.isOverdue,
    raw: base.raw,
    pickupGate: base.pickupGate,
    returnGate: base.returnGate,
    runtime,
  });

  return {
    ...base,
    workState,
    blockerReason,
    isDueNow: base.isOverdue,
  };
}

export function compareOperatorTodayWorkItems(
  a: OperatorTodayBookingItem,
  b: OperatorTodayBookingItem,
): number {
  const rankA = OPERATOR_TODAY_WORK_STATE_RANK[a.workState];
  const rankB = OPERATOR_TODAY_WORK_STATE_RANK[b.workState];
  if (rankA !== rankB) return rankA - rankB;

  const timeA = Date.parse(a.scheduledAt);
  const timeB = Date.parse(b.scheduledAt);
  const safeA = Number.isFinite(timeA) ? timeA : Number.MAX_SAFE_INTEGER;
  const safeB = Number.isFinite(timeB) ? timeB : Number.MAX_SAFE_INTEGER;
  if (safeA !== safeB) return safeA - safeB;

  return a.bookingId.localeCompare(b.bookingId);
}

function sortWorkItems(items: OperatorTodayBookingItem[]): OperatorTodayBookingItem[] {
  return [...items].sort(compareOperatorTodayWorkItems);
}

function mapPickupEntry(
  entry: { item: PickupTileItem; state?: VehicleRuntimeState },
  input: {
    operationalPickups: TodayBookingApiRow[];
    healthMap: Map<string, VehicleHealthResponse>;
    locale: string;
    nowMs: number;
  },
): OperatorTodayBookingItem | null {
  const row = findRowByBookingId(input.operationalPickups, entry.item.bookingId);
  if (!row) return null;
  const base = mapPickupRow(row, input.healthMap, input.locale, input.nowMs);
  if (!base) return null;
  return enrichOperatorTodayItem(base, entry.state);
}

function mapReturnEntry(
  entry: { item: ReturnTileItem; state?: VehicleRuntimeState },
  input: {
    operationalReturns: TodayBookingApiRow[];
    locale: string;
    nowMs: number;
  },
): OperatorTodayBookingItem | null {
  const row = findRowByBookingId(input.operationalReturns, entry.item.bookingId);
  if (!row) return null;
  const base = mapReturnRow(row, input.locale, input.nowMs);
  if (!base) return null;
  return enrichOperatorTodayItem(base, entry.state);
}

/**
 * Canonical Operator Today booking queue.
 *
 * Timezone rule:
 * - Classification uses org IANA timezone (`Organization.timezone`, default Europe/Berlin).
 * - API today lists are already org-day filtered server-side; client re-check uses the same TZ.
 * - Browser local timezone is never used for calendar membership.
 * - Station timezone is reserved for future station-scoped display; labels use API ISO + locale.
 */
export function buildOperatorTodayWorkQueue(input: {
  pickups: TodayBookingApiRow[];
  returns: TodayBookingApiRow[];
  fleetVehicles: VehicleData[];
  healthMap: Map<string, VehicleHealthResponse>;
  locale?: string;
  orgTimezone?: string | null;
  referenceNow?: Date;
}): OperatorTodayWorkQueue {
  const locale = input.locale ?? 'de';
  const orgTimezone = input.orgTimezone?.trim() || DEFAULT_ORG_TIMEZONE;
  const referenceNow = input.referenceNow ?? new Date();
  const nowMs = referenceNow.getTime();

  const operationalPickups = filterOperatorOperationalTodayRows(input.pickups);
  const operationalReturns = filterOperatorOperationalTodayRows(input.returns);

  const vehicleLookup = buildVehicleLookup(input.fleetVehicles);
  const pickupItems = mapPickupItems(operationalPickups, vehicleLookup, locale, null);
  const returnItems = mapReturnItems(operationalReturns, vehicleLookup, locale, null);

  const blockedVehicleIds = new Set<string>();
  for (const [vehicleId, health] of input.healthMap.entries()) {
    if (health.rental_blocked) blockedVehicleIds.add(vehicleId);
  }

  const vehicleStates = buildVehicleRuntimeStates({
    fleetVehicles: input.fleetVehicles,
    healthMap: input.healthMap,
    blockedVehicleIds,
    pickupItems,
    returnItems,
    locale,
    now: referenceNow,
  });

  const classified = classifyTodaysOperational({
    vehicleStates,
    pickupItems,
    returnItems,
    now: referenceNow,
    timeZone: orgTimezone,
  });

  const mapperInput = {
    operationalPickups,
    operationalReturns,
    healthMap: input.healthMap,
    locale,
    nowMs,
  };

  const overduePickups = sortWorkItems(
    classified.overduePickups
      .map((entry) => mapPickupEntry(entry, mapperInput))
      .filter((item): item is OperatorTodayBookingItem => item !== null),
  );

  const overdueReturns = sortWorkItems(
    classified.overdueReturns
      .map((entry) => mapReturnEntry(entry, mapperInput))
      .filter((item): item is OperatorTodayBookingItem => item !== null),
  );

  const pickupsToday = sortWorkItems(
    classified.pickupsToday
      .map((entry) => mapPickupEntry(entry, mapperInput))
      .filter((item): item is OperatorTodayBookingItem => item !== null),
  );

  const returnsToday = sortWorkItems(
    classified.returnsToday
      .map((entry) => mapReturnEntry(entry, mapperInput))
      .filter((item): item is OperatorTodayBookingItem => item !== null),
  );

  const urgentHandovers = sortWorkItems([...overduePickups, ...overdueReturns]);

  return {
    overduePickups,
    overdueReturns,
    pickupsToday,
    returnsToday,
    urgentHandovers,
    orgTimezone,
    referenceNow,
  };
}

/** Dedupe guard — booking/kind keys must be unique within a rendered section. */
export function assertNoDuplicateTodayWorkItems(
  items: OperatorTodayBookingItem[],
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}:${item.bookingId}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate today work item: ${key}`);
    }
    seen.add(key);
  }
}

export function derivePickupGateForRow(
  row: TodayBookingApiRow,
  healthMap: Map<string, VehicleHealthResponse>,
): BookingHandoverGate {
  return derivePickupGate(row, healthMap);
}

export function deriveReturnGateForRow(row: TodayBookingApiRow): BookingHandoverGate {
  return deriveReturnGate(row);
}
