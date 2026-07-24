import { InsightCandidate, InsightEntityScope, InsightSeverity, InsightType } from './insight.types';
import { buildFinancialImpactMetrics } from '@synq/money/money-insight-metrics';
import { minorToWholeMajorUnits } from '@synq/money/money.util';

/** Raw vehicle-health detector types — only publish when tied to an upcoming booking. */
export const RAW_HEALTH_INSIGHT_TYPES = new Set<InsightType>([
  InsightType.BATTERY_CRITICAL,
  InsightType.TIRE_CRITICAL,
  InsightType.BRAKE_CRITICAL,
]);

export type UpcomingBookingSlice = {
  id: string;
  vehicleId: string;
  customerId: string;
  startDate: Date;
  totalPriceCents: number | null;
  dailyRateCents: number | null;
};

export function estimateBookingRevenueCents(booking: UpcomingBookingSlice): number {
  if (booking.totalPriceCents != null && booking.totalPriceCents > 0) {
    return booking.totalPriceCents;
  }
  if (booking.dailyRateCents != null && booking.dailyRateCents > 0) {
    return booking.dailyRateCents;
  }
  return 0;
}

export function enrichHealthCandidateWithBooking(
  candidate: InsightCandidate,
  booking: UpcomingBookingSlice,
  vehicleLabel: string,
  now: Date,
): InsightCandidate {
  const hoursUntil = Math.max(
    0,
    Math.round((booking.startDate.getTime() - now.getTime()) / 3_600_000),
  );
  const financialImpactCents = estimateBookingRevenueCents(booking);
  const revenueEur = minorToWholeMajorUnits(financialImpactCents, 'EUR');
  const healthReason = candidate.reasons[0] ?? candidate.message;
  const when =
    hoursUntil < 24
      ? `in ${hoursUntil} Std.`
      : `am ${booking.startDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;

  const revenueSuffix =
    revenueEur > 0 ? ` Potenzielles Ausfall-/Umsatzrisiko: ca. ${revenueEur} €.` : '';

  return {
    ...candidate,
    title: 'Ausfallrisiko vor Buchung',
    message: `${vehicleLabel} ist ${when} gebucht, aber ${healthReason.toLowerCase()}.${revenueSuffix}`,
    actionLabel: 'Buchung & Fahrzeug prüfen',
    actionType: 'navigate_booking',
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: [booking.id, candidate.entityIds[0]],
    timeContext: {
      ...(candidate.timeContext ?? {}),
      bookingId: booking.id,
      pickupAt: booking.startDate.toISOString(),
      customerId: booking.customerId,
    },
    metrics: {
      ...(candidate.metrics ?? {}),
      category: 'BUSINESS_RISK',
      bookingId: booking.id,
      customerId: booking.customerId,
      affectedVehicleId: candidate.entityIds[0],
      hoursUntilPickup: hoursUntil,
      recommendation:
        revenueEur > 0
          ? 'Fahrzeug vor Übergabe prüfen oder Buchung umplanen.'
          : 'Fahrzeug vor Übergabe prüfen.',
      ...buildFinancialImpactMetrics(financialImpactCents, 'EUR'),
    },
    reasons: [
      ...candidate.reasons,
      `Anstehende Buchung ${booking.id.slice(0, 8)}`,
      ...(revenueEur > 0 ? [`Geschätztes Umsatzrisiko ${revenueEur} €`] : []),
    ],
    priority: Math.max(candidate.priority, candidate.severity === InsightSeverity.CRITICAL ? 88 : 75),
  };
}

/**
 * Drop raw health insights without booking context; enrich the rest for the
 * operator cockpit. Non-health candidates pass through unchanged.
 */
export function gateHealthInsightsForBusinessContext(
  candidates: InsightCandidate[],
  bookingByVehicleId: Map<string, UpcomingBookingSlice>,
  vehicleLabelById: Map<string, string>,
  now: Date,
): InsightCandidate[] {
  const out: InsightCandidate[] = [];

  for (const c of candidates) {
    if (!RAW_HEALTH_INSIGHT_TYPES.has(c.type)) {
      out.push(tagInsightCategory(c));
      continue;
    }

    const vehicleId = c.entityIds[0];
    if (!vehicleId) continue;

    const booking = bookingByVehicleId.get(vehicleId);
    if (!booking) continue;

    const label = vehicleLabelById.get(vehicleId) ?? vehicleId.slice(0, 8);
    out.push(enrichHealthCandidateWithBooking(c, booking, label, now));
  }

  return out;
}

const BUSINESS_RISK_TYPES = new Set<InsightType>([
  InsightType.TIGHT_HANDOVER,
  InsightType.RETURN_NEEDS_INSPECTION,
  InsightType.STATION_SHORTAGE,
  InsightType.SERVICE_BEFORE_BOOKING,
  InsightType.SERVICE_WINDOW,
  InsightType.PICKUP_OVERDUE,
  InsightType.SERVICE_OVERDUE,
  InsightType.TUV_OVERDUE,
  InsightType.BOKRAFT_OVERDUE,
]);

const REVENUE_LEAKAGE_TYPES = new Set<InsightType>([InsightType.LOW_UTILIZATION]);

export type InsightDisplayCategory =
  | 'BUSINESS_RISK'
  | 'REVENUE_LEAKAGE'
  | 'FINANCIAL'
  | 'MISUSE_ABUSE'
  | 'OPERATIONAL_RECOMMENDATION';

export function resolveInsightCategory(type: InsightType, metrics?: Record<string, unknown> | null): InsightDisplayCategory {
  const fromMetrics = metrics?.category;
  if (fromMetrics === 'BUSINESS_RISK' || fromMetrics === 'REVENUE_LEAKAGE') {
    return fromMetrics;
  }
  if (REVENUE_LEAKAGE_TYPES.has(type)) return 'REVENUE_LEAKAGE';
  if (BUSINESS_RISK_TYPES.has(type)) return 'BUSINESS_RISK';
  return 'OPERATIONAL_RECOMMENDATION';
}

function tagInsightCategory(c: InsightCandidate): InsightCandidate {
  const category = resolveInsightCategory(c.type, c.metrics);
  if (c.metrics?.category === category) return c;
  return {
    ...c,
    metrics: { ...(c.metrics ?? {}), category },
  };
}
