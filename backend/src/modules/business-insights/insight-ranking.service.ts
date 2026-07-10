import { Injectable } from '@nestjs/common';
import { InsightCandidate, InsightSeverity, InsightType } from './insight.types';

const SEVERITY_BASE: Record<InsightSeverity, number> = {
  [InsightSeverity.CRITICAL]: 100,
  [InsightSeverity.WARNING]: 65,
  [InsightSeverity.OPPORTUNITY]: 30,
  [InsightSeverity.INFO]: 10,
};

const TYPE_OPERATIONAL_WEIGHT: Record<InsightType, number> = {
  [InsightType.TIGHT_HANDOVER]: 15,
  [InsightType.SERVICE_BEFORE_BOOKING]: 12,
  [InsightType.STATION_SHORTAGE]: 14,
  [InsightType.RETURN_NEEDS_INSPECTION]: 8,
  [InsightType.LOW_UTILIZATION]: 3,
  [InsightType.SERVICE_WINDOW]: 2,
  // Battery-critical: outranks LOW_UTILIZATION / SERVICE_WINDOW because a
  // starting problem is an immediate operational blocker (can strand a
  // vehicle at pickup). Sits below TIGHT_HANDOVER so acute customer-facing
  // handover risks still take the top slot.
  [InsightType.BATTERY_CRITICAL]: 13,
  // Tire-critical: a tire at/below the legal minimum (1.6 mm) makes the
  // vehicle legally non-operable and is an acute safety risk — ranked on par
  // with battery-critical. The detector's own graduated severity (WATCH never
  // alerts, WARNING vs CRITICAL) keeps "plan replacement" below "replace now".
  [InsightType.TIRE_CRITICAL]: 13,
  // Brake-critical: a safety-relevant brake condition (measured critical pad,
  // brake DTC, critical fluid, confirmed immediate replacement) is an acute
  // safety risk — ranked on par with tire/battery critical. The detector caps
  // pure estimates at WARNING so "plan service" stays below "replace now".
  [InsightType.BRAKE_CRITICAL]: 13,
  // Service overdue: a lapsed manufacturer service threatens warranty,
  // operational safety, and upcoming bookings. Ranked just above
  // SERVICE_BEFORE_BOOKING because "already overdue" beats "must be
  // resolved before next pickup" and at par with battery-critical so a
  // fleet with both simultaneous issues shows both on the dashboard.
  [InsightType.SERVICE_OVERDUE]: 13,
  // Pickup overdue: an acute customer-facing event — scheduled pickup
  // has passed without a handover protocol. Ranked on par with
  // TIGHT_HANDOVER because both belong to the "right now, in-flight
  // booking" class of alerts; the detector's own graduated severity
  // (INFO → WARNING → CRITICAL at 24 h) does the heavy lifting to
  // keep a 45-min late pickup below a 3-day-stuck booking on the
  // dashboard ordering.
  [InsightType.PICKUP_OVERDUE]: 15,
  // TÜV / BOKraft overdue: statutory compliance — an overdue inspection makes
  // the vehicle legally non-operable, so it ranks at par with service-overdue.
  // The detector's own severity (WARNING ≤60d vs CRITICAL overdue) handles the
  // imminent-vs-lapsed ordering.
  [InsightType.TUV_OVERDUE]: 13,
  [InsightType.BOKRAFT_OVERDUE]: 13,
  [InsightType.HM_SERVICE_NO_TRACKING]: 1,
  [InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY]: 11,
};

@Injectable()
export class InsightRankingService {
  rank(candidates: InsightCandidate[]): InsightCandidate[] {
    return candidates
      .map((c) => ({ candidate: c, score: this.score(c) }))
      .sort((a, b) => b.score - a.score)
      .map(({ candidate, score }) => ({
        ...candidate,
        priority: Math.round(score),
      }));
  }

  private score(c: InsightCandidate): number {
    let s = SEVERITY_BASE[c.severity] ?? 0;

    s += (TYPE_OPERATIONAL_WEIGHT[c.type] ?? 0);

    s += Math.min(c.priority, 100) * 0.3;

    s += c.confidence * 8;

    const urgency = this.timeUrgencyBonus(c);
    s += urgency;

    const revMetric = (c.metrics?.lostRevenueEur as number) ?? (c.metrics?.dailyRateEur as number) ?? 0;
    if (revMetric > 0) s += Math.min(revMetric / 50, 10);

    if (c.entityIds.length > 1) s += Math.min(c.entityIds.length * 2, 12);

    return s;
  }

  private timeUrgencyBonus(c: InsightCandidate): number {
    const urgentField =
      c.timeContext?.returnAt ?? c.timeContext?.nextPickupAt ?? c.timeContext?.pickupAt ?? c.expiresAt?.toISOString();
    if (!urgentField) return 0;

    const hoursUntil = (new Date(urgentField).getTime() - Date.now()) / 3600_000;
    if (hoursUntil <= 0) return 20;
    if (hoursUntil <= 2) return 18;
    if (hoursUntil <= 6) return 14;
    if (hoursUntil <= 12) return 10;
    if (hoursUntil <= 24) return 6;
    return 0;
  }
}
