import type { TaskType, VehicleStationTransferStatus } from '@prisma/client';
import { StationBookingRuleReasonCode } from './station-booking-rules.contract';
import type { StationBookingRulesResult } from './station-booking-rules.contract';
import type { HandoverStationRulesResult } from './handover-station-rules.contract';
import {
  STATION_OPERATIONS_TIMELINE_DEFAULT_PAGE_SIZE,
  STATION_OPERATIONS_TIMELINE_MAX_PAGE_SIZE,
  StationOperationsTimelineEntryType,
  StationOperationsTimelineSortOrder,
  type StationOperationsTimelineEntry,
  type StationOperationsTimelineReadModel,
  type StationOperationsTimelineReference,
  type StationOperationsTimelineSortOrder as SortOrder,
} from './station-operations-timeline.contract';
import { formatStationTime, parseStationInstant, stationDayBoundsUtc, stationLocalDate } from './station-timezone.util';

export interface StationOperationsTimelineBookingRow {
  id: string;
  status: string;
  vehicleId: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  isOneWayRental: boolean;
  startDate: Date;
  endDate: Date;
  stationBookingRulesSnapshot: unknown;
  vehicle: {
    licensePlate: string | null;
    vehicleName: string | null;
    make: string | null;
    model: string | null;
  };
}

export interface StationOperationsTimelineTransferRow {
  id: string;
  vehicleId: string;
  fromStationId: string | null;
  toStationId: string;
  status: VehicleStationTransferStatus;
  plannedAt: Date;
  expectedArrivalAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  sourceBookingId: string | null;
  vehicle: {
    licensePlate: string | null;
    vehicleName: string | null;
    make: string | null;
    model: string | null;
  };
}

export interface StationOperationsTimelineTaskRow {
  id: string;
  type: TaskType;
  status: string;
  title: string;
  vehicleId: string | null;
  bookingId: string | null;
  dueDate: Date | null;
  activatesAt: Date;
  metadata: unknown;
  vehicle: {
    licensePlate: string | null;
    vehicleName: string | null;
    make: string | null;
    model: string | null;
  } | null;
}

export interface StationOperationsTimelineHandoverRow {
  id: string;
  bookingId: string;
  vehicleId: string;
  kind: 'PICKUP' | 'RETURN';
  performedAt: Date;
  actualStationId: string | null;
  stationRulesSnapshot: unknown;
  vehicle: {
    licensePlate: string | null;
    vehicleName: string | null;
    make: string | null;
    model: string | null;
  };
}

export interface ResolveStationOperationsTimelineInput {
  organizationId: string;
  stationId: string;
  timezone: string;
  evaluatedAt: string;
  fromUtc: Date;
  toUtc: Date;
  sortOrder: SortOrder;
  page: number;
  pageSize: number;
  scopeApplied: boolean;
  bookings: StationOperationsTimelineBookingRow[];
  transfers: StationOperationsTimelineTransferRow[];
  tasks: StationOperationsTimelineTaskRow[];
  handovers: StationOperationsTimelineHandoverRow[];
  completedHandoverKindsByBookingId: ReadonlyMap<string, ReadonlySet<'PICKUP' | 'RETURN'>>;
}

const ACTIVE_BOOKING_STATUSES = new Set(['PENDING', 'CONFIRMED', 'ACTIVE']);
const CANCELLED_BOOKING_STATUSES = new Set(['CANCELLED', 'NO_SHOW']);

function vehicleLabel(
  vehicle: Pick<
    StationOperationsTimelineBookingRow['vehicle'],
    'licensePlate' | 'vehicleName' | 'make' | 'model'
  >,
): string | null {
  return (
    vehicle.licensePlate?.trim() ||
    vehicle.vehicleName?.trim() ||
    [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim() ||
    null
  );
}

function bookingLabel(bookingId: string): string {
  return `BKG-${bookingId.replace(/-/g, '').slice(-8).toUpperCase()}`;
}

function buildReferences(input: {
  bookingId?: string | null;
  vehicleId?: string | null;
  transferId?: string | null;
  taskId?: string | null;
  vehicle?: StationOperationsTimelineBookingRow['vehicle'] | null;
}): StationOperationsTimelineReference {
  return {
    bookingId: input.bookingId ?? null,
    vehicleId: input.vehicleId ?? null,
    transferId: input.transferId ?? null,
    taskId: input.taskId ?? null,
    bookingLabel: input.bookingId ? bookingLabel(input.bookingId) : null,
    vehicleLabel: input.vehicle ? vehicleLabel(input.vehicle) : null,
  };
}

function deepLinkBooking(bookingId: string): string {
  return `/operator/bookings/${bookingId}`;
}

function deepLinkVehicle(vehicleId: string, transferId?: string | null): string {
  if (transferId) {
    return `/operator/vehicles/${vehicleId}?transferId=${transferId}`;
  }
  return `/operator/vehicles/${vehicleId}`;
}

function deepLinkTask(taskId: string): string {
  return `/operator/tasks?taskId=${taskId}`;
}

function formatEntryTimes(instant: Date, timezone: string) {
  return {
    instantUtc: instant.toISOString(),
    stationLocalTime: formatStationTime(instant, timezone, {
      dateStyle: 'short',
      timeStyle: 'short',
    }),
    stationLocalDate: stationLocalDate(instant, timezone),
  };
}

function buildEntry(
  id: string,
  type: StationOperationsTimelineEntryType,
  status: string,
  instant: Date,
  timezone: string,
  references: StationOperationsTimelineReference,
  options: {
    actionRequired: boolean;
    ruleWarning: boolean;
    ruleWarningCodes: string[];
    deepLink: string;
  },
): StationOperationsTimelineEntry {
  return {
    id,
    type,
    status,
    ...formatEntryTimes(instant, timezone),
    references,
    actionRequired: options.actionRequired,
    ruleWarning: options.ruleWarning,
    ruleWarningCodes: options.ruleWarningCodes,
    deepLink: options.deepLink,
  };
}

function parseBookingRulesSnapshot(snapshot: unknown): StationBookingRulesResult | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot as StationBookingRulesResult;
}

function parseHandoverRulesSnapshot(snapshot: unknown): HandoverStationRulesResult | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot as HandoverStationRulesResult;
}

function afterHoursReasonCodes(reasons: Array<{ code: string }> | undefined): string[] {
  if (!reasons?.length) return [];
  return reasons
    .map((reason) => reason.code)
    .filter(
      (code) =>
        code === StationBookingRuleReasonCode.AFTER_HOURS_ALLOWED ||
        code === StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
    );
}

function ruleWarningCodesFromSide(
  side: StationBookingRulesResult['pickup'] | undefined,
): string[] {
  if (!side) return [];
  const codes = side.reasons.map((reason) => reason.code);
  if (side.outcome === 'WARNING' || side.outcome === 'MANUAL_CONFIRMATION_REQUIRED') {
    return codes;
  }
  return codes.filter(
    (code) =>
      code === StationBookingRuleReasonCode.CAPACITY_WARNING ||
      code === StationBookingRuleReasonCode.CAPACITY_MANUAL_CONFIRMATION ||
      code === StationBookingRuleReasonCode.ONE_WAY_MISMATCH,
  );
}

function isInstantInWindow(instant: Date, fromUtc: Date, toUtc: Date): boolean {
  const ms = instant.getTime();
  return ms >= fromUtc.getTime() && ms <= toUtc.getTime();
}

function pickupStatus(
  booking: StationOperationsTimelineBookingRow,
  evaluatedAt: Date,
  completedKinds: ReadonlySet<'PICKUP' | 'RETURN'> | undefined,
): string {
  if (CANCELLED_BOOKING_STATUSES.has(booking.status)) return 'CANCELLED';
  if (completedKinds?.has('PICKUP') || booking.status === 'COMPLETED') return 'COMPLETED';
  if (
    ACTIVE_BOOKING_STATUSES.has(booking.status) &&
    booking.startDate.getTime() < evaluatedAt.getTime()
  ) {
    return 'OVERDUE';
  }
  return 'SCHEDULED';
}

function returnStatus(
  booking: StationOperationsTimelineBookingRow,
  evaluatedAt: Date,
  completedKinds: ReadonlySet<'PICKUP' | 'RETURN'> | undefined,
): string {
  if (CANCELLED_BOOKING_STATUSES.has(booking.status)) return 'CANCELLED';
  if (completedKinds?.has('RETURN') || booking.status === 'COMPLETED') return 'COMPLETED';
  if (booking.status === 'ACTIVE' && booking.endDate.getTime() < evaluatedAt.getTime()) {
    return 'OVERDUE';
  }
  return 'SCHEDULED';
}

function buildBookingEntries(
  input: ResolveStationOperationsTimelineInput,
  evaluatedAt: Date,
): StationOperationsTimelineEntry[] {
  const entries: StationOperationsTimelineEntry[] = [];

  for (const booking of input.bookings) {
    const completedKinds = input.completedHandoverKindsByBookingId.get(booking.id);
    const rules = parseBookingRulesSnapshot(booking.stationBookingRulesSnapshot);
    const vehicle = booking.vehicle;
    const refs = buildReferences({
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      vehicle,
    });

    if (booking.pickupStationId === input.stationId) {
      const instant = booking.startDate;
      if (isInstantInWindow(instant, input.fromUtc, input.toUtc)) {
        const status = pickupStatus(booking, evaluatedAt, completedKinds);
        const pickupWarnings = ruleWarningCodesFromSide(rules?.pickup);
        entries.push(
          buildEntry(
            `pickup:${booking.id}`,
            StationOperationsTimelineEntryType.PICKUP,
            status,
            instant,
            input.timezone,
            refs,
            {
              actionRequired: status === 'OVERDUE' || status === 'SCHEDULED',
              ruleWarning: pickupWarnings.length > 0,
              ruleWarningCodes: pickupWarnings,
              deepLink: deepLinkBooking(booking.id),
            },
          ),
        );

        const afterHoursCodes = afterHoursReasonCodes(rules?.pickup?.reasons);
        if (afterHoursCodes.length > 0) {
          entries.push(
            buildEntry(
              `after-hours-pickup:${booking.id}`,
              StationOperationsTimelineEntryType.AFTER_HOURS_EVENT,
              status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED',
              instant,
              input.timezone,
              refs,
              {
                actionRequired: status !== 'COMPLETED' && status !== 'CANCELLED',
                ruleWarning: true,
                ruleWarningCodes: afterHoursCodes,
                deepLink: deepLinkBooking(booking.id),
              },
            ),
          );
        }
      }
    }

    if (booking.returnStationId === input.stationId) {
      const instant = booking.endDate;
      const status = returnStatus(booking, evaluatedAt, completedKinds);
      const isOverdue = status === 'OVERDUE';
      const returnWarnings = ruleWarningCodesFromSide(rules?.return);

      if (isOverdue && isInstantInWindow(instant, input.fromUtc, input.toUtc)) {
        entries.push(
          buildEntry(
            `overdue-return:${booking.id}`,
            StationOperationsTimelineEntryType.OVERDUE_RETURN,
            'OVERDUE',
            instant,
            input.timezone,
            refs,
            {
              actionRequired: true,
              ruleWarning: returnWarnings.length > 0,
              ruleWarningCodes: returnWarnings,
              deepLink: deepLinkBooking(booking.id),
            },
          ),
        );
      } else if (isInstantInWindow(instant, input.fromUtc, input.toUtc)) {
        if (booking.isOneWayRental) {
          entries.push(
            buildEntry(
              `one-way-arrival:${booking.id}`,
              StationOperationsTimelineEntryType.ONE_WAY_ARRIVAL,
              status,
              instant,
              input.timezone,
              refs,
              {
                actionRequired: status === 'SCHEDULED',
                ruleWarning: returnWarnings.length > 0,
                ruleWarningCodes: returnWarnings,
                deepLink: deepLinkBooking(booking.id),
              },
            ),
          );
        } else {
          entries.push(
            buildEntry(
              `return:${booking.id}`,
              StationOperationsTimelineEntryType.RETURN,
              status,
              instant,
              input.timezone,
              refs,
              {
                actionRequired: status === 'SCHEDULED',
                ruleWarning: returnWarnings.length > 0,
                ruleWarningCodes: returnWarnings,
                deepLink: deepLinkBooking(booking.id),
              },
            ),
          );
        }

        const afterHoursCodes = afterHoursReasonCodes(rules?.return?.reasons);
        if (afterHoursCodes.length > 0) {
          entries.push(
            buildEntry(
              `after-hours-return:${booking.id}`,
              StationOperationsTimelineEntryType.AFTER_HOURS_EVENT,
              status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED',
              instant,
              input.timezone,
              refs,
              {
                actionRequired: status !== 'COMPLETED' && status !== 'CANCELLED',
                ruleWarning: true,
                ruleWarningCodes: afterHoursCodes,
                deepLink: deepLinkBooking(booking.id),
              },
            ),
          );
        }
      }
    }
  }

  return entries;
}

function transferInstant(transfer: StationOperationsTimelineTransferRow, arrival: boolean): Date {
  if (arrival) {
    return transfer.expectedArrivalAt ?? transfer.plannedAt;
  }
  return transfer.startedAt ?? transfer.plannedAt;
}

function buildTransferEntries(input: ResolveStationOperationsTimelineInput): StationOperationsTimelineEntry[] {
  const entries: StationOperationsTimelineEntry[] = [];

  for (const transfer of input.transfers) {
    const vehicle = transfer.vehicle;
    const refs = buildReferences({
      bookingId: transfer.sourceBookingId,
      vehicleId: transfer.vehicleId,
      transferId: transfer.id,
      vehicle,
    });
    const status = transfer.status;

    if (transfer.toStationId === input.stationId) {
      const instant = transferInstant(transfer, true);
      if (isInstantInWindow(instant, input.fromUtc, input.toUtc)) {
        entries.push(
          buildEntry(
            `transfer-arrival:${transfer.id}`,
            StationOperationsTimelineEntryType.TRANSFER_ARRIVAL,
            status,
            instant,
            input.timezone,
            refs,
            {
              actionRequired: status === 'PLANNED' || status === 'READY' || status === 'OVERDUE',
              ruleWarning: status === 'OVERDUE',
              ruleWarningCodes: status === 'OVERDUE' ? ['TRANSFER_OVERDUE'] : [],
              deepLink: deepLinkVehicle(transfer.vehicleId, transfer.id),
            },
          ),
        );
      }
    }

    if (transfer.fromStationId === input.stationId) {
      const instant = transferInstant(transfer, false);
      if (isInstantInWindow(instant, input.fromUtc, input.toUtc)) {
        entries.push(
          buildEntry(
            `transfer-departure:${transfer.id}`,
            StationOperationsTimelineEntryType.TRANSFER_DEPARTURE,
            status,
            instant,
            input.timezone,
            refs,
            {
              actionRequired: status === 'PLANNED' || status === 'READY',
              ruleWarning: status === 'OVERDUE',
              ruleWarningCodes: status === 'OVERDUE' ? ['TRANSFER_OVERDUE'] : [],
              deepLink: deepLinkVehicle(transfer.vehicleId, transfer.id),
            },
          ),
        );
      }
    }
  }

  return entries;
}

function taskInstant(task: StationOperationsTimelineTaskRow): Date {
  return task.dueDate ?? task.activatesAt;
}

function buildTaskEntries(input: ResolveStationOperationsTimelineInput): StationOperationsTimelineEntry[] {
  const entries: StationOperationsTimelineEntry[] = [];

  for (const task of input.tasks) {
    const instant = taskInstant(task);
    if (!isInstantInWindow(instant, input.fromUtc, input.toUtc)) {
      continue;
    }

    entries.push(
      buildEntry(
        `task:${task.id}`,
        StationOperationsTimelineEntryType.OPERATIONAL_TASK,
        task.status,
        instant,
        input.timezone,
        buildReferences({
          bookingId: task.bookingId,
          vehicleId: task.vehicleId,
          taskId: task.id,
          vehicle: task.vehicle,
        }),
        {
          actionRequired: task.status === 'OPEN' || task.status === 'IN_PROGRESS',
          ruleWarning: false,
          ruleWarningCodes: [],
          deepLink: deepLinkTask(task.id),
        },
      ),
    );
  }

  return entries;
}

function buildHandoverAfterHoursEntries(
  input: ResolveStationOperationsTimelineInput,
): StationOperationsTimelineEntry[] {
  const entries: StationOperationsTimelineEntry[] = [];

  for (const handover of input.handovers) {
    if (handover.actualStationId !== input.stationId) {
      continue;
    }
    const rules = parseHandoverRulesSnapshot(handover.stationRulesSnapshot);
    const afterHoursCodes = afterHoursReasonCodes(rules?.reasons);
    if (afterHoursCodes.length === 0) {
      continue;
    }
    const instant = handover.performedAt;
    if (!isInstantInWindow(instant, input.fromUtc, input.toUtc)) {
      continue;
    }

    entries.push(
      buildEntry(
        `after-hours-handover:${handover.id}`,
        StationOperationsTimelineEntryType.AFTER_HOURS_EVENT,
        'COMPLETED',
        instant,
        input.timezone,
        buildReferences({
          bookingId: handover.bookingId,
          vehicleId: handover.vehicleId,
          vehicle: handover.vehicle,
        }),
        {
          actionRequired: false,
          ruleWarning: true,
          ruleWarningCodes: afterHoursCodes,
          deepLink: deepLinkBooking(handover.bookingId),
        },
      ),
    );
  }

  return entries;
}

export function normalizeStationOperationsTimelinePageSize(
  pageSize?: number,
): { pageSize: number; pageSizeCapped: boolean } {
  if (pageSize == null || pageSize <= 0) {
    return { pageSize: STATION_OPERATIONS_TIMELINE_DEFAULT_PAGE_SIZE, pageSizeCapped: false };
  }
  if (pageSize > STATION_OPERATIONS_TIMELINE_MAX_PAGE_SIZE) {
    return { pageSize: STATION_OPERATIONS_TIMELINE_MAX_PAGE_SIZE, pageSizeCapped: true };
  }
  return { pageSize, pageSizeCapped: false };
}

export function resolveStationOperationsTimeline(
  input: ResolveStationOperationsTimelineInput,
): StationOperationsTimelineReadModel {
  const evaluatedAt = new Date(input.evaluatedAt);
  const allEntries = [
    ...buildBookingEntries(input, evaluatedAt),
    ...buildTransferEntries(input),
    ...buildTaskEntries(input),
    ...buildHandoverAfterHoursEntries(input),
  ];

  const sorted = allEntries.sort((left, right) => {
    const delta =
      new Date(left.instantUtc).getTime() - new Date(right.instantUtc).getTime();
    if (delta !== 0) {
      return input.sortOrder === StationOperationsTimelineSortOrder.DESC ? -delta : delta;
    }
    return left.id.localeCompare(right.id);
  });

  const total = sorted.length;
  const page = input.page > 0 ? input.page : 1;
  const skip = (page - 1) * input.pageSize;
  const entries = sorted.slice(skip, skip + input.pageSize);

  return {
    version: 1,
    stationId: input.stationId,
    organizationId: input.organizationId,
    evaluatedAt: input.evaluatedAt,
    window: {
      fromUtc: input.fromUtc.toISOString(),
      toUtc: input.toUtc.toISOString(),
      timezone: input.timezone,
    },
    sortOrder: input.sortOrder,
    pagination: {
      page,
      pageSize: input.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    },
    entries,
    scope: {
      applied: input.scopeApplied,
      mode: input.scopeApplied ? 'SCOPED_STATIONS' : 'ALL_STATIONS',
    },
    frontendRecomputation: false,
  };
}

export function resolveDefaultTimelineWindow(
  timezone: string,
  evaluatedAt: string,
  rangeDays: number,
): { fromUtc: Date; toUtc: Date } {
  const evaluated = parseStationInstant(evaluatedAt);
  const today = stationLocalDate(evaluated, timezone);
  const todayBounds = stationDayBoundsUtc(today, timezone);
  const fromUtc = new Date(todayBounds.startUtc.getTime() - 24 * 60 * 60 * 1000);
  const toUtc = new Date(todayBounds.endUtc.getTime() + rangeDays * 24 * 60 * 60 * 1000);
  return { fromUtc, toUtc };
}

export * from './station-operations-timeline.contract';
