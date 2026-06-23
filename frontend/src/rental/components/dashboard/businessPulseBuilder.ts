import {
  effectiveInvoiceDate,
  expensesInRange,
  issuedRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  sumCents,
  type InvoiceSlice,
} from '../../lib/financial-insights.logic';
import type { StatusTone } from '../../../components/patterns';
import type { DashboardInvoice, MonthlyKpiSnapshot } from './dashboardTypes';

export type BusinessPulseDrilldown = 'financial-insights' | 'invoices';

export interface BusinessPulseMetricItem {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone: StatusTone;
  unavailable?: boolean;
  trend?: {
    label: string;
    direction: 'up' | 'down';
    invert?: boolean;
  };
  drilldown?: BusinessPulseDrilldown;
}

/** A single value in the compact financial snapshot. */
export interface BusinessPulseCompactMetric {
  /** Drilldown metric id reused by the existing drawer (no new truth). */
  id: string;
  label: string;
  value: string;
  /** Optional sub-line (e.g. "4 open"). */
  hint?: string;
  /** False when the value could not be computed (renders dimmed). */
  available: boolean;
  /** True for overdue receivables > 0 → subtle critical emphasis. */
  emphasize?: boolean;
}

/** Compact, scan-friendly financial snapshot (max 4 primary values + expenses). */
export interface BusinessPulseCompact {
  monthLabel: string;
  invoiceCount: number;
  revenue: BusinessPulseCompactMetric;
  profit: BusinessPulseCompactMetric;
  openReceivables: BusinessPulseCompactMetric;
  overdueReceivables: BusinessPulseCompactMetric;
  /** Only present when real expense data exists. */
  expenses: BusinessPulseCompactMetric | null;
}

export interface BusinessPulseSnapshot {
  loading: boolean;
  error: boolean;
  stationScoped: boolean;
  monthLabel: string;
  hasFinancialData: boolean;
  primaryMetrics: BusinessPulseMetricItem[];
  secondaryMetrics: BusinessPulseMetricItem[];
  /** Structured values for the compact snapshot UI. */
  compact: BusinessPulseCompact;
  emptyTitle: string;
  emptySubtitle: string;
}

function scopeInvoices(
  invoices: DashboardInvoice[],
  vehicleIds: Set<string> | null,
): DashboardInvoice[] {
  if (!vehicleIds) return invoices;
  return invoices.filter((inv) => inv.vehicleId && vehicleIds.has(inv.vehicleId));
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function computeMonthlyKpisFromInvoices(
  invoices: DashboardInvoice[],
  intlLocale: string,
  vehicleIds: Set<string> | null = null,
): MonthlyKpiSnapshot {
  const scoped = scopeInvoices(invoices, vehicleIds);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const mtdRevenueRows = issuedRevenueInRange(scoped as InvoiceSlice[], monthStart, now);
  const mtdExpenseRows = expensesInRange(scoped as InvoiceSlice[], monthStart, now);
  const prevRevenueRows = issuedRevenueInRange(scoped as InvoiceSlice[], prevMonthStart, prevMonthEnd);
  const prevExpenseRows = expensesInRange(scoped as InvoiceSlice[], prevMonthStart, prevMonthEnd);

  const mtdRevenue = sumCents(mtdRevenueRows);
  const mtdExpense = sumCents(mtdExpenseRows);
  const prevRevenue = sumCents(prevRevenueRows);
  const prevExpense = sumCents(prevExpenseRows);
  const profitCents = mtdRevenue - mtdExpense;
  const prevProfitCents = prevRevenue - prevExpense;

  const profitDeltaPct = (() => {
    if (prevProfitCents === 0) return null;
    return ((profitCents - prevProfitCents) / Math.abs(prevProfitCents)) * 100;
  })();

  return {
    revenueCents: mtdRevenue,
    expenseCents: mtdExpense,
    profitCents,
    revenueCount: mtdRevenueRows.length,
    expenseCount: mtdExpenseRows.length,
    revenueDeltaPct: deltaPct(mtdRevenue, prevRevenue),
    expenseDeltaPct: deltaPct(mtdExpense, prevExpense),
    profitDeltaPct,
    monthLabel: now.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' }),
  };
}

export function buildBusinessPulseSnapshot(input: {
  locale: string;
  intlLocale: string;
  invoices: DashboardInvoice[];
  invoicesLoaded: boolean;
  invoicesError: boolean;
  fleetLoaded: boolean;
  fleetTotal: number;
  activeRentedCount: number;
  availableCount: number;
  readyCount: number;
  stationScoped: boolean;
  fmtEUR: (cents: number) => string;
  labels: {
    revenue: string;
    profit: string;
    expenses: string;
    unpaid: string;
    utilization: string;
    revenuePerVehicle: string;
    lostRevenueRisk: string;
    invoicesShort: (count: number) => string;
    noData: string;
    notEnoughBasis: string;
    emptyTitle: string;
    emptySubtitle: string;
    stationNote: string;
  };
  vehicleIds: Set<string> | null;
}): BusinessPulseSnapshot {
  const de = input.locale === 'de';
  const scoped = scopeInvoices(input.invoices, input.vehicleIds);
  const monthly = computeMonthlyKpisFromInvoices(input.invoices, input.intlLocale, input.vehicleIds);
  const now = new Date();

  const openReceivables = openOutgoingReceivables(scoped as InvoiceSlice[], now);
  const overdueReceivables = overdueOutgoingReceivables(scoped as InvoiceSlice[], now);
  const openCents = sumCents(openReceivables);
  const overdueCents = sumCents(overdueReceivables);

  const hasFinancialData =
    monthly.revenueCount > 0 || monthly.expenseCount > 0 || openReceivables.length > 0;

  const primaryMetrics: BusinessPulseMetricItem[] = [
    {
      id: 'revenue',
      label: input.labels.revenue,
      value: hasFinancialData ? input.fmtEUR(monthly.revenueCents) : input.labels.noData,
      hint: hasFinancialData
        ? `${monthly.monthLabel} · ${input.labels.invoicesShort(monthly.revenueCount)}`
        : input.stationScoped
          ? input.labels.stationNote
          : undefined,
      tone: 'success',
      unavailable: !hasFinancialData,
      trend:
        monthly.revenueDeltaPct != null
          ? {
              label: `${monthly.revenueDeltaPct >= 0 ? '+' : ''}${monthly.revenueDeltaPct.toFixed(1)}%`,
              direction: monthly.revenueDeltaPct >= 0 ? 'up' : 'down',
            }
          : undefined,
      drilldown: 'financial-insights',
    },
    {
      id: 'profit',
      label: input.labels.profit,
      value:
        monthly.revenueCount > 0 || monthly.expenseCount > 0
          ? input.fmtEUR(monthly.profitCents)
          : input.labels.noData,
      hint: monthly.monthLabel,
      tone: monthly.profitCents >= 0 ? 'info' : 'critical',
      unavailable: monthly.revenueCount === 0 && monthly.expenseCount === 0,
      trend:
        monthly.profitDeltaPct != null
          ? {
              label: `${monthly.profitDeltaPct >= 0 ? '+' : ''}${monthly.profitDeltaPct.toFixed(1)}%`,
              direction: monthly.profitDeltaPct >= 0 ? 'up' : 'down',
            }
          : undefined,
      drilldown: 'financial-insights',
    },
    {
      id: 'expenses',
      label: input.labels.expenses,
      value:
        monthly.expenseCount > 0
          ? input.fmtEUR(monthly.expenseCents)
          : input.labels.noData,
      hint:
        monthly.expenseCount > 0
          ? `${monthly.monthLabel} · ${input.labels.invoicesShort(monthly.expenseCount)}`
          : undefined,
      tone: 'watch',
      unavailable: monthly.expenseCount === 0,
      trend:
        monthly.expenseDeltaPct != null
          ? {
              label: `${monthly.expenseDeltaPct >= 0 ? '+' : ''}${monthly.expenseDeltaPct.toFixed(1)}%`,
              direction: monthly.expenseDeltaPct >= 0 ? 'up' : 'down',
              invert: true,
            }
          : undefined,
      drilldown: 'financial-insights',
    },
  ];

  const secondaryMetrics: BusinessPulseMetricItem[] = [];

  if (openReceivables.length > 0) {
    secondaryMetrics.push({
      id: 'unpaid',
      label: input.labels.unpaid,
      value: input.fmtEUR(openCents),
      hint: de
        ? `${openReceivables.length} offen${overdueReceivables.length > 0 ? ` · ${overdueReceivables.length} überfällig` : ''}`
        : `${openReceivables.length} open${overdueReceivables.length > 0 ? ` · ${overdueReceivables.length} overdue` : ''}`,
      tone: overdueReceivables.length > 0 ? 'critical' : 'watch',
      drilldown: 'invoices',
    });
  }

  if (input.fleetLoaded && input.fleetTotal > 0) {
    const utilizationPct = Math.round((input.activeRentedCount / input.fleetTotal) * 100);
    secondaryMetrics.push({
      id: 'utilization',
      label: input.labels.utilization,
      value: `${utilizationPct}%`,
      hint: de
        ? `${input.activeRentedCount}/${input.fleetTotal} vermietet`
        : `${input.activeRentedCount}/${input.fleetTotal} rented`,
      tone: utilizationPct >= 60 ? 'success' : utilizationPct >= 35 ? 'info' : 'watch',
    });
  }

  const revPerDenom =
    input.activeRentedCount > 0
      ? input.activeRentedCount
      : input.readyCount > 0
        ? input.readyCount
        : 0;
  if (monthly.revenueCents > 0 && revPerDenom > 0) {
    const perVehicle = Math.round(monthly.revenueCents / revPerDenom);
    secondaryMetrics.push({
      id: 'revenue-per-vehicle',
      label: input.labels.revenuePerVehicle,
      value: input.fmtEUR(perVehicle),
      hint:
        input.activeRentedCount > 0
          ? de
            ? 'MTD / vermietete Fahrzeuge'
            : 'MTD / rented vehicles'
          : de
            ? 'MTD / bereite Fahrzeuge'
            : 'MTD / ready vehicles',
      tone: 'neutral',
      drilldown: 'financial-insights',
    });
  }

  if (overdueCents > 0) {
    secondaryMetrics.push({
      id: 'lost-revenue-risk',
      label: input.labels.lostRevenueRisk,
      value: input.fmtEUR(overdueCents),
      hint: de
        ? `${overdueReceivables.length} überfällige Forderungen`
        : `${overdueReceivables.length} overdue receivables`,
      tone: 'critical',
      drilldown: 'invoices',
    });
  }

  const profitAvailable = monthly.revenueCount > 0 || monthly.expenseCount > 0;
  const compact: BusinessPulseCompact = {
    monthLabel: monthly.monthLabel,
    invoiceCount: monthly.revenueCount,
    revenue: {
      id: 'revenue',
      label: input.labels.revenue,
      value: hasFinancialData
        ? input.fmtEUR(monthly.revenueCents)
        : de
          ? 'Noch kein Umsatz'
          : 'No revenue yet',
      hint: hasFinancialData ? input.labels.invoicesShort(monthly.revenueCount) : undefined,
      available: hasFinancialData,
    },
    profit: {
      id: 'profit',
      label: input.labels.profit,
      value: profitAvailable
        ? input.fmtEUR(monthly.profitCents)
        : de
          ? 'Nicht berechnet'
          : 'Not calculated',
      hint: profitAvailable ? monthly.monthLabel : undefined,
      available: profitAvailable,
    },
    openReceivables: {
      id: 'unpaid',
      label: input.labels.unpaid,
      value: input.fmtEUR(openCents),
      hint:
        openReceivables.length > 0
          ? de
            ? `${openReceivables.length} offen`
            : `${openReceivables.length} open`
          : undefined,
      available: true,
    },
    overdueReceivables: {
      id: 'lost-revenue-risk',
      label: input.labels.lostRevenueRisk,
      value: input.fmtEUR(overdueCents),
      hint:
        overdueReceivables.length > 0
          ? de
            ? `${overdueReceivables.length} überfällig`
            : `${overdueReceivables.length} overdue`
          : undefined,
      available: true,
      emphasize: overdueCents > 0,
    },
    expenses:
      monthly.expenseCount > 0
        ? {
            id: 'expenses',
            label: input.labels.expenses,
            value: input.fmtEUR(monthly.expenseCents),
            hint: input.labels.invoicesShort(monthly.expenseCount),
            available: true,
          }
        : null,
  };

  return {
    loading: !input.invoicesLoaded,
    error: input.invoicesError,
    stationScoped: input.stationScoped,
    monthLabel: monthly.monthLabel,
    hasFinancialData,
    primaryMetrics,
    secondaryMetrics,
    compact,
    emptyTitle: input.labels.emptyTitle,
    emptySubtitle: input.labels.emptySubtitle,
  };
}

/** @deprecated Use computeMonthlyKpisFromInvoices — kept for tests referencing effective date helper */
export { effectiveInvoiceDate };
