import type { ApiTask, VehicleTripAnalytics, VehicleTripStats } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import type { DamageStatsResponse } from './damage.types';
import type { VehicleBookingOperatorInput } from './vehicle-booking-operator.utils';
import { deriveVehicleBookingOperatorSnapshot } from './vehicle-booking-operator.utils';
import type { VehicleFileSummary } from './vehicle-file-summary.types';
import {
  parseVehicleOperatorTaskList,
  pickNextBestAction,
} from './task-operator.utils';
import type { VehicleTaskRow } from './task-display.utils';
import { countVehicleTasks } from './task-display.utils';
import type {
  VehicleOverviewBookingsCardSummary,
  VehicleOverviewCardStatus,
  VehicleOverviewDamagesCardSummary,
  VehicleOverviewDocumentsCardSummary,
  VehicleOverviewLoadState,
  VehicleOverviewTasksCardSummary,
  VehicleOverviewTripsCardSummary,
} from './vehicle-overview.types';
import { buildOverviewBookingsHorizon } from './vehicle-overview-summary.utils';

const MS_HOUR = 60 * 60 * 1000;

function resolveLoadState(
  loading: boolean,
  error: boolean,
  unavailable: boolean,
): VehicleOverviewLoadState {
  if (loading) return 'loading';
  if (unavailable) return 'unavailable';
  if (error) return 'error';
  return 'ready';
}

function formatClock(date: Date, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatShortDateTime(date: Date, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isDueToday(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  return !Number.isNaN(due.getTime()) && isSameLocalDay(due, now);
}

function isDueSoon(iso: string | null, now: Date, withinHours = 48): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return false;
  const delta = due.getTime() - now.getTime();
  return delta >= 0 && delta <= withinHours * MS_HOUR;
}

function normalizeRawTasks(rawTasks: unknown): ApiTask[] {
  if (Array.isArray(rawTasks)) return rawTasks;
  if (rawTasks && typeof rawTasks === 'object') {
    const data = (rawTasks as { data?: unknown }).data;
    if (Array.isArray(data)) return data as ApiTask[];
  }
  return [];
}

function countTaskUrgency(rawTasks: ApiTask[], now: Date) {
  let critical = 0;
  let dueToday = 0;
  let dueSoon = 0;
  let blocking = 0;

  for (const task of rawTasks) {
    if (task.status === 'DONE' || task.status === 'CANCELLED') continue;
    const priority = (task.priority ?? 'NORMAL').toUpperCase();
    if (priority === 'CRITICAL') critical += 1;
    if (task.blocksVehicleAvailability === true) blocking += 1;
    if (isDueToday(task.dueDate ?? null, now)) dueToday += 1;
    else if (isDueSoon(task.dueDate ?? null, now)) dueSoon += 1;
  }

  return { critical, dueToday, dueSoon, blocking };
}

function parseTripEndTime(trip: VehicleTripAnalytics): Date | null {
  const raw = trip.endTime ?? trip.startTime;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sumTripBehaviorEvents(trips: VehicleTripAnalytics[]): number {
  return trips.reduce((sum, trip) => {
    return (
      sum +
      (trip.abuseEvents ?? 0) +
      (trip.hardBrakingEvents ?? 0) +
      (trip.hardAccelerationEvents ?? 0)
    );
  }, 0);
}

function tripStressStatus(
  trips: VehicleTripAnalytics[],
  stats: VehicleTripStats | null,
): VehicleOverviewCardStatus {
  const levels = [
    ...trips.map((trip) => trip.stressLevel),
    stats?.stressLevel ?? null,
  ].filter(Boolean);

  if (levels.some((level) => level === 'critical')) return 'critical';
  if (levels.some((level) => level === 'high')) return 'attention';
  if (levels.some((level) => level === 'moderate')) return 'attention';
  return 'clear';
}

export function buildTodayTripsQueryRange(now = Date.now()): { from: string; to: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function parseOverviewTripList(rows: unknown): VehicleTripAnalytics[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is VehicleTripAnalytics => {
    return Boolean(row && typeof row === 'object' && typeof (row as VehicleTripAnalytics).id === 'string');
  });
}

export function buildTripsOverviewCard(input: {
  todayTrips: VehicleTripAnalytics[];
  tripStats: VehicleTripStats | null;
  loading?: boolean;
  error?: boolean;
  unavailable?: boolean;
  now?: number;
}): VehicleOverviewTripsCardSummary {
  const now = input.now ?? Date.now();
  const nowDate = new Date(now);
  const loadState = resolveLoadState(
    input.loading === true,
    input.error === true,
    input.unavailable === true,
  );

  if (loadState === 'loading') {
    return {
      id: 'trips',
      title: 'Trips',
      headline: 'Loading trips',
      lastTripLabel: 'Loading trips',
      status: 'neutral',
      loadState,
      targetTab: 'trips',
    };
  }

  if (loadState === 'unavailable' || loadState === 'error') {
    return {
      id: 'trips',
      title: 'Trips',
      headline: 'No trip data',
      lastTripLabel: 'No trip data',
      status: 'neutral',
      loadState,
      targetTab: 'trips',
    };
  }

  const completedToday = input.todayTrips
    .filter((trip) => trip.tripStatus === 'COMPLETED')
    .map((trip) => ({ trip, end: parseTripEndTime(trip) }))
    .filter((entry): entry is { trip: VehicleTripAnalytics; end: Date } => entry.end != null)
    .filter((entry) => isSameLocalDay(entry.end, nowDate))
    .sort((a, b) => b.end.getTime() - a.end.getTime());

  const ongoingToday = input.todayTrips.filter((trip) => trip.tripStatus === 'ONGOING');

  const todayDistanceKm = completedToday.reduce(
    (sum, entry) => sum + (entry.trip.distanceKm ?? 0),
    0,
  );
  const eventCount = sumTripBehaviorEvents(input.todayTrips);

  let lastTripLabel = 'No trips today';
  if (ongoingToday.length > 0) {
    lastTripLabel = 'Trip in progress';
  } else if (completedToday.length > 0) {
    lastTripLabel = `Last trip today ${formatClock(completedToday[0]!.end)}`;
  } else if ((input.tripStats?.totalTrips ?? 0) > 0) {
    lastTripLabel = 'No trips today';
  } else {
    lastTripLabel = 'No trip data yet';
  }

  const todayDistanceLabel =
    todayDistanceKm > 0 ? `${Math.round(todayDistanceKm)} km today` : undefined;

  const eventCountLabel = eventCount > 0 ? `${eventCount} events today` : undefined;

  let status: VehicleOverviewCardStatus = 'neutral';
  if (ongoingToday.length > 0 || completedToday.length > 0) {
    status = tripStressStatus(input.todayTrips, input.tripStats);
  } else if ((input.tripStats?.totalTrips ?? 0) > 0) {
    status = 'clear';
  }

  const headline =
    ongoingToday.length > 0
      ? 'Trip in progress'
      : completedToday.length > 0
        ? lastTripLabel
        : (input.tripStats?.totalTrips ?? 0) > 0
          ? 'No trips today'
          : 'No trip data yet';

  return {
    id: 'trips',
    title: 'Trips',
    headline,
    subline: todayDistanceLabel ?? eventCountLabel,
    lastTripLabel,
    todayDistanceLabel,
    eventCountLabel,
    status,
    loadState,
    targetTab: 'trips',
  };
}

export function buildBookingsOverviewCard(input: {
  bookings: VehicleBookingOperatorInput[];
  vehicle?: VehicleData | null;
  loading?: boolean;
  error?: boolean;
  unavailable?: boolean;
  now?: number;
}): VehicleOverviewBookingsCardSummary {
  const now = input.now ?? Date.now();
  const loadState = resolveLoadState(
    input.loading === true,
    input.error === true,
    input.unavailable === true,
  );
  const horizon = buildOverviewBookingsHorizon(now);
  const snapshot = deriveVehicleBookingOperatorSnapshot(
    input.bookings,
    horizon,
    input.vehicle,
    now,
  );

  const isOverdue = snapshot.operatorState === 'overdue';

  if (loadState === 'loading') {
    return {
      id: 'bookings',
      title: 'Bookings',
      headline: 'Loading bookings',
      status: 'neutral',
      loadState,
      isOverdue: false,
      targetTab: 'vehicle-bookings',
    };
  }

  if (loadState === 'error') {
    return {
      id: 'bookings',
      title: 'Bookings',
      headline: 'No booking data',
      status: 'neutral',
      loadState,
      isOverdue: false,
      targetTab: 'vehicle-bookings',
    };
  }

  const activeBookingLabel = snapshot.activeBooking
    ? `Active · ${snapshot.activeBooking.customerName}`
    : undefined;

  const nextBookingLabel = snapshot.nextPickup
    ? `Next pickup · ${snapshot.nextPickup.customerName}`
    : snapshot.nextReturn && !snapshot.activeBooking
      ? `Next return · ${snapshot.nextReturn.customerName}`
      : undefined;

  const dueLabel = isOverdue
    ? snapshot.activeBooking
      ? `Return overdue · ${formatShortDateTime(snapshot.activeBooking.endDate)}`
      : 'Return overdue'
    : snapshot.nextPickup
      ? `Pickup ${formatShortDateTime(snapshot.nextPickup.startDate)}`
      : snapshot.nextReturn
        ? `Return ${formatShortDateTime(snapshot.nextReturn.endDate)}`
        : undefined;

  let status: VehicleOverviewCardStatus = 'clear';
  if (snapshot.operatorState === 'blocked' || isOverdue) status = 'critical';
  else if (snapshot.operatorState === 'active') status = 'active';
  else if (snapshot.operatorState === 'reserved') status = 'attention';
  else if (snapshot.operatorState === 'available') status = 'clear';

  let headline = 'No upcoming booking';
  if (isOverdue) headline = 'Return overdue';
  else if (snapshot.operatorState === 'active') headline = activeBookingLabel ?? 'Active rental';
  else if (snapshot.nextPickup) headline = nextBookingLabel ?? 'Next pickup scheduled';
  else if (snapshot.nextReturn) headline = nextBookingLabel ?? 'Next return scheduled';
  else if (snapshot.operatorState === 'blocked') headline = 'Vehicle blocked';

  return {
    id: 'bookings',
    title: 'Bookings',
    headline,
    subline: dueLabel ?? snapshot.operatorDetail,
    activeBookingLabel,
    nextBookingLabel,
    dueLabel,
    isOverdue,
    status,
    loadState,
    targetTab: 'vehicle-bookings',
  };
}

export function buildTasksOverviewCard(input: {
  tasks: VehicleTaskRow[];
  rawTasks?: ApiTask[];
  loading?: boolean;
  error?: boolean;
  unavailable?: boolean;
  now?: number;
}): VehicleOverviewTasksCardSummary {
  const now = input.now ?? Date.now();
  const nowDate = new Date(now);
  const loadState = resolveLoadState(
    input.loading === true,
    input.error === true,
    input.unavailable === true,
  );
  const counts = countVehicleTasks(input.tasks);
  const rawTasks = normalizeRawTasks(input.rawTasks);
  const urgency = countTaskUrgency(rawTasks, nowDate);
  const operatorRows = parseVehicleOperatorTaskList(rawTasks, null);
  const nextAction = pickNextBestAction(operatorRows);

  if (loadState === 'loading') {
    return {
      id: 'tasks',
      title: 'Tasks',
      headline: 'Loading tasks',
      openCount: 0,
      criticalCount: 0,
      dueTodayCount: 0,
      dueSoonCount: 0,
      blockingCount: 0,
      status: 'neutral',
      loadState,
      targetTab: 'vehicle-tasks',
    };
  }

  if (loadState === 'error') {
    return {
      id: 'tasks',
      title: 'Tasks',
      headline: 'No task data',
      openCount: 0,
      criticalCount: 0,
      dueTodayCount: 0,
      dueSoonCount: 0,
      blockingCount: 0,
      status: 'neutral',
      loadState,
      targetTab: 'vehicle-tasks',
    };
  }

  const openCount = counts.active;
  let status: VehicleOverviewCardStatus = 'clear';
  if (urgency.blocking > 0 || urgency.critical > 0) status = 'critical';
  else if (urgency.dueToday > 0 || counts.overdue > 0) status = 'attention';
  else if (openCount > 0) status = 'neutral';

  let headline = 'No open tasks';
  if (urgency.blocking > 0) headline = `${urgency.blocking} blocking task${urgency.blocking === 1 ? '' : 's'}`;
  else if (counts.overdue > 0) headline = `${counts.overdue} overdue task${counts.overdue === 1 ? '' : 's'}`;
  else if (openCount > 0) headline = `${openCount} open task${openCount === 1 ? '' : 's'}`;

  const topTaskSubline = nextAction
    ? `${nextAction.label} · ${nextAction.task.title}`
    : undefined;

  return {
    id: 'tasks',
    title: 'Tasks',
    headline,
    subline: topTaskSubline,
    openCount,
    criticalCount: urgency.critical,
    dueTodayCount: urgency.dueToday,
    dueSoonCount: urgency.dueSoon,
    blockingCount: urgency.blocking,
    topTaskSubline,
    status,
    loadState,
    targetTab: 'vehicle-tasks',
  };
}

export function buildDamagesOverviewCard(input: {
  stats: DamageStatsResponse | null;
  loading?: boolean;
  error?: boolean;
  unavailable?: boolean;
}): VehicleOverviewDamagesCardSummary {
  const loadState = resolveLoadState(
    input.loading === true,
    input.error === true,
    input.unavailable === true,
  );
  const openCount = input.stats?.open ?? 0;
  const blockingCount = input.stats?.blockingRental ?? 0;
  const safetyCriticalCount = input.stats?.safetyCritical ?? 0;

  if (loadState === 'loading') {
    return {
      id: 'damages',
      title: 'Damages',
      headline: 'Loading damages',
      openCount: 0,
      blockingCount: 0,
      safetyCriticalCount: 0,
      status: 'neutral',
      loadState,
      targetTab: 'damages',
    };
  }

  if (loadState === 'unavailable' || loadState === 'error') {
    return {
      id: 'damages',
      title: 'Damages',
      headline: 'No damage data',
      openCount: 0,
      blockingCount: 0,
      safetyCriticalCount: 0,
      status: 'neutral',
      loadState,
      targetTab: 'damages',
    };
  }

  let status: VehicleOverviewCardStatus = 'clear';
  if (blockingCount > 0 || safetyCriticalCount > 0) status = 'critical';
  else if (openCount > 0) status = 'attention';

  let headline = 'No open damages';
  if (blockingCount > 0) {
    headline = `${blockingCount} blocking damage${blockingCount === 1 ? '' : 's'}`;
  } else if (openCount > 0) {
    headline = `${openCount} open damage${openCount === 1 ? '' : 's'}`;
  }

  let latestStatusLabel: string | undefined;
  if (safetyCriticalCount > 0) {
    latestStatusLabel = `${safetyCriticalCount} safety critical`;
  } else if (blockingCount > 0) {
    latestStatusLabel = 'Blocks rental';
  } else if (input.stats?.oldestOpenDamageAt) {
    const opened = new Date(input.stats.oldestOpenDamageAt);
    if (!Number.isNaN(opened.getTime())) {
      latestStatusLabel = `Oldest open since ${formatShortDateTime(opened)}`;
    }
  }

  return {
    id: 'damages',
    title: 'Damages',
    headline,
    subline: latestStatusLabel,
    openCount,
    blockingCount,
    safetyCriticalCount,
    latestStatusLabel,
    status,
    loadState,
    targetTab: 'damages',
  };
}

export function buildDocumentsOverviewCard(input: {
  summary: VehicleFileSummary | null;
  loading?: boolean;
  error?: boolean;
  unavailable?: boolean;
}): VehicleOverviewDocumentsCardSummary {
  const loadState = resolveLoadState(
    input.loading === true,
    input.error === true,
    input.unavailable === true,
  );
  const categories = input.summary?.documentCategories ?? [];

  let missingCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  let needsReviewCount = input.summary?.pendingReviews?.count ?? 0;

  for (const category of categories) {
    if (category.uiStatus === 'missing') missingCount += 1;
    if (category.uiStatus === 'expiring_soon') expiringSoonCount += 1;
    if (category.uiStatus === 'expired') expiredCount += 1;
    if (category.uiStatus === 'needs_review') needsReviewCount += 1;
  }

  const mandatoryTotal = input.summary?.mandatoryDocumentCoverage.total ?? 0;
  const mandatoryConfigured = input.summary?.mandatoryDocumentCoverage.configured ?? 0;

  if (loadState === 'loading') {
    return {
      id: 'documents',
      title: 'Documents',
      headline: 'Loading documents',
      missingCount: 0,
      expiringSoonCount: 0,
      expiredCount: 0,
      needsReviewCount: 0,
      trackingLabel: 'Loading',
      status: 'neutral',
      loadState,
      targetTab: 'documents',
    };
  }

  if (loadState === 'error' || !input.summary) {
    return {
      id: 'documents',
      title: 'Documents',
      headline: 'No data yet',
      missingCount: 0,
      expiringSoonCount: 0,
      expiredCount: 0,
      needsReviewCount: 0,
      trackingLabel: 'No data yet',
      status: 'neutral',
      loadState: loadState === 'error' ? 'error' : 'ready',
      targetTab: 'documents',
    };
  }

  const trackingLabel =
    mandatoryTotal === 0
      ? 'No tracking'
      : mandatoryConfigured >= mandatoryTotal
        ? 'Complete'
        : `${mandatoryConfigured}/${mandatoryTotal} mandatory`;

  let status: VehicleOverviewCardStatus = 'clear';
  if (expiredCount > 0 || missingCount > 0) status = 'critical';
  else if (expiringSoonCount > 0 || needsReviewCount > 0) status = 'attention';
  else if (mandatoryTotal === 0) status = 'neutral';
  else status = 'clear';

  let headline = 'Clear';
  if (expiredCount > 0) headline = `${expiredCount} expired document${expiredCount === 1 ? '' : 's'}`;
  else if (missingCount > 0) headline = `${missingCount} missing document${missingCount === 1 ? '' : 's'}`;
  else if (expiringSoonCount > 0) {
    headline = `${expiringSoonCount} expiring soon`;
  } else if (needsReviewCount > 0) {
    headline = `${needsReviewCount} need review`;
  } else if (mandatoryTotal === 0) {
    headline = 'No tracking';
  }

  const sublineParts: string[] = [];
  if (missingCount > 0) sublineParts.push(`${missingCount} missing`);
  if (expiringSoonCount > 0) sublineParts.push(`${expiringSoonCount} expiring soon`);
  if (trackingLabel !== 'Complete' && trackingLabel !== 'Clear') sublineParts.push(trackingLabel);

  return {
    id: 'documents',
    title: 'Documents',
    headline,
    subline: sublineParts.length > 0 ? sublineParts.join(' · ') : trackingLabel,
    missingCount,
    expiringSoonCount,
    expiredCount,
    needsReviewCount,
    trackingLabel,
    status,
    loadState,
    targetTab: 'documents',
  };
}

export function buildOverviewCards(input: {
  todayTrips: VehicleTripAnalytics[];
  tripStats: VehicleTripStats | null;
  tripsLoading?: boolean;
  tripsError?: boolean;
  tripsUnavailable?: boolean;
  bookings: VehicleBookingOperatorInput[];
  vehicle?: VehicleData | null;
  bookingsLoading?: boolean;
  bookingsError?: boolean;
  tasks: VehicleTaskRow[];
  rawTasks?: ApiTask[];
  tasksLoading?: boolean;
  tasksError?: boolean;
  damageStats: DamageStatsResponse | null;
  damagesLoading?: boolean;
  damagesError?: boolean;
  damagesUnavailable?: boolean;
  fileSummary: VehicleFileSummary | null;
  documentsLoading?: boolean;
  documentsError?: boolean;
  now?: number;
}): import('./vehicle-overview.types').VehicleOverviewCards {
  return {
    trips: buildTripsOverviewCard({
      todayTrips: input.todayTrips,
      tripStats: input.tripStats,
      loading: input.tripsLoading,
      error: input.tripsError,
      unavailable: input.tripsUnavailable,
      now: input.now,
    }),
    bookings: buildBookingsOverviewCard({
      bookings: input.bookings,
      vehicle: input.vehicle,
      loading: input.bookingsLoading,
      error: input.bookingsError,
      now: input.now,
    }),
    tasks: buildTasksOverviewCard({
      tasks: input.tasks,
      rawTasks: input.rawTasks,
      loading: input.tasksLoading,
      error: input.tasksError,
      now: input.now,
    }),
    damages: buildDamagesOverviewCard({
      stats: input.damageStats,
      loading: input.damagesLoading,
      error: input.damagesError,
      unavailable: input.damagesUnavailable,
    }),
    documents: buildDocumentsOverviewCard({
      summary: input.fileSummary,
      loading: input.documentsLoading,
      error: input.documentsError,
    }),
  };
}
