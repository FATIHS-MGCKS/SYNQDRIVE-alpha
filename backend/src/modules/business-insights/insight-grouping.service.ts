import { Injectable } from '@nestjs/common';
import { InsightCandidate, InsightType, InsightSeverity } from './insight.types';

const GROUP_TEMPLATES: Partial<Record<InsightType, (count: number) => string>> = {
  [InsightType.LOW_UTILIZATION]: (n) => `${n} vehicles idle with no recent or upcoming bookings.`,
  [InsightType.SERVICE_WINDOW]: (n) => `${n} vehicles have free windows available for service.`,
};

@Injectable()
export class InsightGroupingService {
  dedupeAndGroup(candidates: InsightCandidate[]): InsightCandidate[] {
    const byKey = new Map<string, InsightCandidate>();
    for (const c of candidates) {
      const existing = byKey.get(c.dedupeKey);
      if (!existing || c.priority > existing.priority) {
        byKey.set(c.dedupeKey, c);
      }
    }

    const deduped = [...byKey.values()];

    const groups = new Map<string, InsightCandidate[]>();
    const ungrouped: InsightCandidate[] = [];

    for (const c of deduped) {
      if (c.groupKey) {
        const arr = groups.get(c.groupKey) ?? [];
        arr.push(c);
        groups.set(c.groupKey, arr);
      } else {
        ungrouped.push(c);
      }
    }

    const result: InsightCandidate[] = [...ungrouped];

    for (const [, items] of groups) {
      if (items.length === 1) {
        result.push(items[0]);
        continue;
      }

      const sorted = items.sort((a, b) => b.priority - a.priority);
      const best = sorted[0];
      const allEntityIds = [...new Set(items.flatMap((i) => i.entityIds))];
      const allReasons = [...new Set(items.flatMap((i) => i.reasons))];
      const highestSeverity = this.pickHighestSeverity(items);
      const templateFn = GROUP_TEMPLATES[best.type];

      const totalRevenue = items.reduce((s, i) => s + ((i.metrics?.lostRevenueEur as number) ?? 0), 0);

      result.push({
        ...best,
        severity: highestSeverity,
        message: templateFn ? templateFn(items.length) : `${items.length} items: ${best.message}`,
        entityIds: allEntityIds,
        reasons: allReasons.slice(0, 5),
        metrics: {
          ...best.metrics,
          groupedCount: items.length,
          ...(totalRevenue > 0 ? { totalLostRevenueEur: totalRevenue } : {}),
        },
        dedupeKey: `grouped:${best.groupKey}`,
      });
    }

    return result;
  }

  private pickHighestSeverity(items: InsightCandidate[]): InsightSeverity {
    const order = [InsightSeverity.CRITICAL, InsightSeverity.WARNING, InsightSeverity.OPPORTUNITY, InsightSeverity.INFO];
    for (const s of order) {
      if (items.some((i) => i.severity === s)) return s;
    }
    return InsightSeverity.INFO;
  }
}
