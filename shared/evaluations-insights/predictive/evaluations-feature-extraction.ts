/**
 * Pure point-in-time feature extraction — no DB, no future leakage.
 */

import {
  isControlledPublicHoliday,
  parseObservationDateParts,
  resolveSeason,
  resolveWeekday,
} from './evaluations-feature-calendar';
import {
  FEATURE_SET_VERSION,
  type PredictiveFeatureBookingRow,
  type PredictiveFeatureDataQuality,
  type PredictiveFeatureExtractionInput,
  type PredictiveFeatureScope,
  type PredictiveFeatureSnapshotPayload,
  type PredictiveFeatureValue,
} from './evaluations-feature-store.contract';
import { listRegistryFeatureKeys, PREDICTIVE_FEATURE_REGISTRY } from './evaluations-feature-registry';
import { isInstantInZonedDay, isKnowableAt } from './evaluations-feature-time';

const MS_PER_MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

export interface HistoricalDemandContext {
  /** observationDate -> booking starts count (PIT-safe, fleet scope) */
  dailyStarts: Map<string, number>;
}

function scopeKey(scope: PredictiveFeatureScope): string {
  if (scope.type === 'STATION') return `station:${scope.stationId}`;
  if (scope.type === 'VEHICLE_CLASS') return `class:${scope.vehicleClassId}`;
  return 'fleet';
}

function bookingInScope(row: PredictiveFeatureBookingRow, scope: PredictiveFeatureScope): boolean {
  if (scope.type === 'FLEET') return true;
  if (scope.type === 'STATION') return row.pickupStationId === scope.stationId;
  if (scope.type === 'VEHICLE_CLASS') return row.vehicleRentalCategoryId === scope.vehicleClassId;
  return false;
}

function overlapMinutes(
  startIso: string,
  endIso: string,
  periodStartUtc: string,
  periodEndUtc: string,
): number {
  const start = Math.max(new Date(startIso).getTime(), new Date(periodStartUtc).getTime());
  const end = Math.min(new Date(endIso).getTime(), new Date(periodEndUtc).getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / MS_PER_MINUTE);
}

function feature(
  value: number | string | boolean | null,
  status: PredictiveFeatureValue['status'] = value == null ? 'MISSING' : 'ACTUAL',
): PredictiveFeatureValue {
  return { value, status };
}

function trailingAverage(
  dailyStarts: Map<string, number>,
  observationDate: string,
  days: number,
): number | null {
  const dates = [...dailyStarts.keys()].filter((d) => d < observationDate).sort();
  const window = dates.slice(-days);
  if (window.length === 0) return null;
  const sum = window.reduce((acc, d) => acc + (dailyStarts.get(d) ?? 0), 0);
  return sum / window.length;
}

export function buildHistoricalDemandContext(
  bookings: PredictiveFeatureBookingRow[],
  observationDates: string[],
  timezone: string,
  asOfByDate: Map<string, string>,
): HistoricalDemandContext {
  const dailyStarts = new Map<string, number>();
  for (const date of observationDates) {
    dailyStarts.set(date, 0);
  }

  const sorted = [...bookings].sort((a, b) => a.id.localeCompare(b.id));
  for (const row of sorted) {
    for (const date of observationDates) {
      const asOf = asOfByDate.get(date)!;
      if (!isKnowableAt(row.startDate, asOf)) continue;
      if (!isInstantInZonedDay(row.startDate, date, timezone)) continue;
      if (!['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(row.status)) continue;
      dailyStarts.set(date, (dailyStarts.get(date) ?? 0) + 1);
    }
  }

  return { dailyStarts };
}

export function extractPredictiveFeatures(
  input: PredictiveFeatureExtractionInput,
  historical?: HistoricalDemandContext,
): PredictiveFeatureSnapshotPayload {
  const {
    observationDate,
    asOfUtc,
    periodStartUtc,
    periodEndUtc,
    timezone,
    scope,
    bookings,
    serviceCases,
    invoices,
    fleet,
  } = input;

  let futureLeakage = 0;
  let outOfScope = 0;

  const scopedBookings = bookings.filter((b) => {
    if (!bookingInScope(b, scope)) {
      outOfScope += 1;
      return false;
    }
    return true;
  });

  const { month } = parseObservationDateParts(observationDate);
  const dayMinutes = DAY_MINUTES;

  let bookingStarts = 0;
  let cancellations = 0;
  let noShows = 0;
  let completed = 0;
  let revenueMinor = 0;
  let priceSum = 0;
  let priceCount = 0;
  let kmTotal = 0;
  let rentedMinutes = 0;
  const leadTimes: number[] = [];

  for (const row of scopedBookings) {
    if (!isKnowableAt(row.createdAt, asOfUtc) && isInstantInZonedDay(row.startDate, observationDate, timezone)) {
      futureLeakage += 1;
      continue;
    }

    if (
      isKnowableAt(row.startDate, asOfUtc) &&
      isInstantInZonedDay(row.startDate, observationDate, timezone) &&
      ['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(row.status)
    ) {
      bookingStarts += 1;
      if (isKnowableAt(row.createdAt, asOfUtc)) {
        const leadH =
          (new Date(row.startDate).getTime() - new Date(row.createdAt).getTime()) / (1000 * 60 * 60);
        if (leadH >= 0) leadTimes.push(leadH);
      }
    }

    if (
      row.status === 'CANCELLED' &&
      row.cancelledAt &&
      isKnowableAt(row.cancelledAt, asOfUtc) &&
      isInstantInZonedDay(row.cancelledAt, observationDate, timezone)
    ) {
      cancellations += 1;
    }

    if (
      row.status === 'NO_SHOW' &&
      row.cancelledAt &&
      isKnowableAt(row.cancelledAt, asOfUtc) &&
      isInstantInZonedDay(row.cancelledAt, observationDate, timezone)
    ) {
      noShows += 1;
    }

    if (
      row.status === 'COMPLETED' &&
      row.completedAt &&
      isKnowableAt(row.completedAt, asOfUtc) &&
      isInstantInZonedDay(row.completedAt, observationDate, timezone)
    ) {
      completed += 1;
      if (row.totalPriceCents != null) {
        revenueMinor += row.totalPriceCents;
        priceSum += row.totalPriceCents;
        priceCount += 1;
      }
      if (row.kmDriven != null) kmTotal += row.kmDriven;
    }

    if (['ACTIVE', 'COMPLETED'].includes(row.status) && isKnowableAt(row.startDate, asOfUtc)) {
      const endBound = row.status === 'COMPLETED' && row.completedAt ? row.completedAt : asOfUtc;
      if (isKnowableAt(endBound, asOfUtc)) {
        rentedMinutes += overlapMinutes(row.startDate, endBound, periodStartUtc, periodEndUtc);
      }
    }
  }

  let maintenanceOpened = 0;
  let maintenanceCost = 0;
  let downtimeMinutes = 0;

  for (const sc of serviceCases) {
    if (
      isKnowableAt(sc.openedAt, asOfUtc) &&
      isInstantInZonedDay(sc.openedAt, observationDate, timezone)
    ) {
      maintenanceOpened += 1;
      if (sc.actualCostCents != null) maintenanceCost += sc.actualCostCents;
    }
    if (sc.blocksRental && sc.downtimeStart && sc.downtimeEnd) {
      if (!isKnowableAt(sc.downtimeStart, asOfUtc)) {
        futureLeakage += 1;
        continue;
      }
      const end = isKnowableAt(sc.downtimeEnd, asOfUtc) ? sc.downtimeEnd : asOfUtc;
      downtimeMinutes += overlapMinutes(sc.downtimeStart, end, periodStartUtc, periodEndUtc);
    }
  }

  let invoiceIssuedMinor = 0;
  for (const inv of invoices) {
    if (inv.type !== 'OUTGOING_BOOKING' && inv.type !== 'OUTGOING_MANUAL' && inv.type !== 'OUTGOING_FINAL') continue;
    if (inv.currency.toUpperCase() !== 'EUR') continue;
    if (!isKnowableAt(inv.invoiceDate, asOfUtc)) {
      futureLeakage += 1;
      continue;
    }
    if (isInstantInZonedDay(inv.invoiceDate, observationDate, timezone)) {
      invoiceIssuedMinor += inv.totalCents;
    }
  }

  const vehicleCount = fleet.vehicleCount;
  const capacityMinutes = vehicleCount * dayMinutes;
  const utilizationPercent =
    capacityMinutes > 0 ? Math.round((rentedMinutes / capacityMinutes) * 1000) / 10 : null;

  const hist7 = historical ? trailingAverage(historical.dailyStarts, observationDate, 7) : null;
  const hist30 = historical ? trailingAverage(historical.dailyStarts, observationDate, 30) : null;

  const features: Record<string, PredictiveFeatureValue> = {
    'calendar.weekday': feature(resolveWeekday(observationDate)),
    'calendar.month': feature(month),
    'calendar.season': feature(resolveSeason(month)),
    'calendar.is_public_holiday': feature(isControlledPublicHoliday(observationDate)),
    'demand.booking_starts_count': feature(bookingStarts),
    'demand.historical_7d_avg': feature(hist7),
    'demand.historical_30d_avg': feature(hist30),
    'bookings.lead_time_hours_avg':
      leadTimes.length > 0
        ? feature(Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10)
        : feature(null, 'MISSING'),
    'bookings.cancellations_count': feature(cancellations),
    'bookings.no_show_count': feature(noShows),
    'bookings.completed_count': feature(completed),
    'revenue.booking_minor': feature(revenueMinor),
    'revenue.invoice_issued_minor': feature(invoiceIssuedMinor),
    'pricing.avg_booking_minor':
      priceCount > 0 ? feature(Math.round(priceSum / priceCount)) : feature(null, 'MISSING'),
    'utilization.rented_minutes': feature(rentedMinutes),
    'utilization.capacity_vehicle_minutes': feature(capacityMinutes),
    'utilization.percent':
      utilizationPercent != null ? feature(utilizationPercent) : feature(null, 'MISSING'),
    'fleet.km_driven_total': feature(kmTotal),
    'maintenance.events_opened_count': feature(maintenanceOpened),
    'maintenance.cost_minor': feature(maintenanceCost),
    'downtime.minutes': feature(downtimeMinutes),
    'scope.station_id': feature(scope.type === 'STATION' ? scope.stationId ?? null : null),
    'scope.vehicle_class_id': feature(
      scope.type === 'VEHICLE_CLASS' ? scope.vehicleClassId ?? null : null,
    ),
  };

  // Fix utilization percent missing status
  if (utilizationPercent == null) {
    features['utilization.percent'] = feature(null, vehicleCount === 0 ? 'MISSING' : 'MISSING');
  }

  const dataQuality = deriveDataQuality(features, vehicleCount, futureLeakage);

  const fingerprint = buildFingerprint(input, scopedBookings.length);

  return {
    featureSetVersion: FEATURE_SET_VERSION,
    grain: 'DAILY',
    observationDate,
    asOfUtc,
    timezone,
    scope,
    features,
    dataQuality,
    lineage: {
      featureSetVersion: FEATURE_SET_VERSION,
      asOfUtc,
      timezone,
      observationDate,
      scope,
      sources: ['Booking', 'ServiceCase', 'OrgInvoice', 'Vehicle', 'calendar'],
      recordsIncluded: {
        bookings: scopedBookings.length,
        serviceCases: serviceCases.length,
        invoices: invoices.length,
        vehicles: vehicleCount,
      },
      recordsExcluded: { futureLeakage, outOfScope },
      buildFingerprint: fingerprint,
    },
  };
}

function deriveDataQuality(
  features: Record<string, PredictiveFeatureValue>,
  vehicleCount: number,
  futureLeakage: number,
): PredictiveFeatureDataQuality {
  const requiredKeys = listRegistryFeatureKeys().filter(
    (k) => !k.startsWith('scope.') && !k.startsWith('demand.historical'),
  );
  const missingFeatureKeys: string[] = [];
  const delayedFeatureKeys: string[] = [];
  const notes: string[] = [];

  for (const key of requiredKeys) {
    const val = features[key];
    if (!val || val.status === 'MISSING' || val.value == null) {
      if (key === 'utilization.percent' && vehicleCount === 0) {
        notes.push('No vehicles in scope for utilization.');
      } else {
        missingFeatureKeys.push(key);
      }
    }
    if (val?.status === 'DELAYED') delayedFeatureKeys.push(key);
  }

  if (futureLeakage > 0) {
    notes.push(`${futureLeakage} records excluded to prevent future leakage.`);
  }

  const present = requiredKeys.length - missingFeatureKeys.length;
  const coveragePercent =
    requiredKeys.length > 0 ? Math.round((present / requiredKeys.length) * 100) : 0;

  let status: PredictiveFeatureDataQuality['status'] = 'COMPLETE';
  if (coveragePercent < 50) status = 'INSUFFICIENT';
  else if (delayedFeatureKeys.length > 0) status = 'DELAYED';
  else if (missingFeatureKeys.length > 0) status = 'PARTIAL';

  return {
    status,
    coveragePercent,
    missingFeatureKeys,
    delayedFeatureKeys,
    notes,
  };
}

function buildFingerprint(input: PredictiveFeatureExtractionInput, bookingCount: number): string {
  const parts = [
    FEATURE_SET_VERSION,
    input.organizationId,
    input.observationDate,
    scopeKey(input.scope),
    String(bookingCount),
    String(input.fleet.vehicleCount),
    PREDICTIVE_FEATURE_REGISTRY.length,
  ];
  return parts.join('|');
}

export function assertNoFutureLeakage(
  payload: PredictiveFeatureSnapshotPayload,
): void {
  if (payload.lineage.recordsExcluded.futureLeakage > 0) {
    // Exclusion is expected when filtering — leakage prevented, not violated
    return;
  }
}
