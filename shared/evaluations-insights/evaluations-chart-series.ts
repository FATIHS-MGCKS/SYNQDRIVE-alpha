/**
 * Chart series helpers — gaps as null, not zero (Prompt 28/54).
 */

export interface EvaluationsChartPoint {
  key: string;
  value: number | null;
}

/** Sum numeric values; returns null when all inputs are null/undefined. */
export function sumNullable(values: Array<number | null | undefined>): number | null {
  let hasAny = false;
  let total = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    hasAny = true;
    total += v;
  }
  return hasAny ? total : null;
}

/**
 * Build a dense daily series. Days without observations stay `null` (chart gap).
 * When `dataUnavailable` is true every point is null.
 */
export function buildDailyChartSeries(input: {
  dayCount: number;
  dayKey: (dayIndex: number) => string;
  observations: Array<{ dayIndex: number; value: number }>;
  dataUnavailable?: boolean;
}): Array<{ day: string; value: number | null }> {
  const out: Array<{ day: string; value: number | null }> = [];
  for (let i = 0; i < input.dayCount; i++) {
    out.push({ day: input.dayKey(i), value: input.dataUnavailable ? null : null });
  }
  if (input.dataUnavailable) {
    return out;
  }
  for (const obs of input.observations) {
    if (obs.dayIndex >= 0 && obs.dayIndex < out.length) {
      const prev = out[obs.dayIndex].value;
      out[obs.dayIndex].value = (prev ?? 0) + obs.value;
    }
  }
  return out;
}

/** Merge revenue/expense series; unavailable flag forces all-null. */
export function mergeRevenueExpenseChartSeries(input: {
  dayCount: number;
  dayKey: (dayIndex: number) => string;
  revenueObservations: Array<{ dayIndex: number; value: number }>;
  expenseObservations: Array<{ dayIndex: number; value: number }>;
  dataUnavailable?: boolean;
}): Array<{ day: string; revenue: number | null; expenses: number | null; profit: number | null }> {
  const revenue = buildDailyChartSeries({
    dayCount: input.dayCount,
    dayKey: input.dayKey,
    observations: input.revenueObservations,
    dataUnavailable: input.dataUnavailable,
  });
  const expenses = buildDailyChartSeries({
    dayCount: input.dayCount,
    dayKey: input.dayKey,
    observations: input.expenseObservations,
    dataUnavailable: input.dataUnavailable,
  });
  return revenue.map((row, idx) => {
    const rev = row.value;
    const exp = expenses[idx]?.value ?? null;
    const profit =
      rev === null && exp === null ? null : (rev ?? 0) - (exp ?? 0);
    return { day: row.day, revenue: rev, expenses: exp, profit };
  });
}

export function chartSeriesHasValues(
  series: Array<{ revenue?: number | null; expenses?: number | null; value?: number | null }>,
): boolean {
  return series.some((row) => {
    const candidates = [row.revenue, row.expenses, row.value];
    return candidates.some((v) => v !== null && v !== undefined && v !== 0);
  });
}
