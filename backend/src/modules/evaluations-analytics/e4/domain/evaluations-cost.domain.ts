/**
 * E4 Cost Model domain (pure, deterministic, money-safe).
 *
 * Guarantees:
 *  - No float money: all aggregation uses the E1/E3 BigInt-backed money helpers.
 *  - No implicit currency: every event carries an explicit ISO-4217 currency.
 *  - No mixed-currency false total: totals are segmented per currency
 *    (COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT / COST_IMPLICIT_CURRENCY_COUNT = 0).
 *  - No double counting: events are deduplicated by their real-world economic
 *    key, preferring the authoritative invoice fact over a linked recorded cost
 *    (COST_DOUBLE_COUNT_COUNT = 0).
 *  - No future leak: events outside `[periodStartMs, periodEndExclusiveMs)` are
 *    dropped using their business timestamp.
 *  - Missing sources never become fabricated zeros — the caller maps empty
 *    coverage to UNAVAILABLE/PARTIAL rather than €0.
 */
import { moneyOfMinor, sumMoneyByCurrency } from '@synq/evaluations-finance/evaluations-money';
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { E4CostCategory, E4CostNature } from '../contracts/evaluations-insights.contract';

export interface E4CostEventInput {
  readonly category: E4CostCategory;
  readonly nature: E4CostNature;
  readonly amountMinor: number;
  readonly currency: string;
  /**
   * Identity of the real-world economic event. Two records that represent the
   * same economic event (e.g. an incoming invoice and the damage repair it
   * pays for, linked by a shared document extraction) MUST share this key so
   * they are counted once.
   */
  readonly economicKey: string;
  readonly businessAtMs: number;
}

export interface E4CostCategoryAggregate {
  readonly category: E4CostCategory;
  readonly nature: E4CostNature;
  readonly totalsByCurrency: readonly EvaluationsMoney[];
  readonly eventCount: number;
}

export interface E4CostAggregation {
  readonly categories: readonly E4CostCategoryAggregate[];
  readonly totalsByCurrency: readonly EvaluationsMoney[];
  readonly droppedFutureOrPastCount: number;
  readonly deduplicatedCount: number;
  readonly currencies: readonly string[];
}

/** Higher wins when two events share the same economic key. Invoice > recorded > estimate. */
const CATEGORY_PRIORITY: Readonly<Record<E4CostCategory, number>> = {
  OPERATING_EXPENSES: 3,
  UNPLANNED_MAINTENANCE: 2,
  DAMAGE_REPAIR: 2,
  ESTIMATED_FIXED_COSTS: 1,
};

const CATEGORY_ORDER: readonly E4CostCategory[] = [
  'OPERATING_EXPENSES',
  'UNPLANNED_MAINTENANCE',
  'DAMAGE_REPAIR',
  'ESTIMATED_FIXED_COSTS',
];

export function aggregateCostEvents(
  events: readonly E4CostEventInput[],
  periodStartMs: number,
  periodEndExclusiveMs: number,
): E4CostAggregation {
  let droppedFutureOrPastCount = 0;

  // 1) Period attribution using the event's business timestamp (no future leak).
  const inPeriod: E4CostEventInput[] = [];
  for (const event of events) {
    if (
      event.businessAtMs >= periodStartMs &&
      event.businessAtMs < periodEndExclusiveMs
    ) {
      inPeriod.push(event);
    } else {
      droppedFutureOrPastCount += 1;
    }
  }

  // 2) Deduplicate by economic key, deterministically preferring the higher
  //    priority category (authoritative invoice over a linked recorded cost).
  const byEconomicKey = new Map<string, E4CostEventInput>();
  let deduplicatedCount = 0;
  for (const event of inPeriod) {
    const existing = byEconomicKey.get(event.economicKey);
    if (!existing) {
      byEconomicKey.set(event.economicKey, event);
      continue;
    }
    deduplicatedCount += 1;
    const existingPriority = CATEGORY_PRIORITY[existing.category];
    const candidatePriority = CATEGORY_PRIORITY[event.category];
    if (
      candidatePriority > existingPriority ||
      (candidatePriority === existingPriority &&
        existing.category !== event.category &&
        event.category < existing.category)
    ) {
      byEconomicKey.set(event.economicKey, event);
    }
  }

  // 3) Group per category and sum per currency (never blended).
  const perCategory = new Map<E4CostCategory, E4CostEventInput[]>();
  for (const event of byEconomicKey.values()) {
    const list = perCategory.get(event.category) ?? [];
    list.push(event);
    perCategory.set(event.category, list);
  }

  const categories: E4CostCategoryAggregate[] = [];
  const allMoney: EvaluationsMoney[] = [];
  for (const category of CATEGORY_ORDER) {
    const list = perCategory.get(category);
    if (!list || list.length === 0) continue;
    const money = list.map((event) => moneyOfMinor(event.amountMinor, event.currency));
    allMoney.push(...money);
    categories.push({
      category,
      nature: list[0].nature,
      totalsByCurrency: sumMoneyByCurrency(money),
      eventCount: list.length,
    });
  }

  const totalsByCurrency = sumMoneyByCurrency(allMoney);
  return {
    categories,
    totalsByCurrency,
    droppedFutureOrPastCount,
    deduplicatedCount,
    currencies: totalsByCurrency.map((money) => money.currency),
  };
}
