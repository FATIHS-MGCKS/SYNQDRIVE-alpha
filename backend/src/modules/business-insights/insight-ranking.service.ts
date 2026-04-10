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
