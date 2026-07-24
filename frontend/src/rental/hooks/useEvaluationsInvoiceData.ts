import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import {
  expensesInRange,
  mtdRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  paidRevenueInRange,
  sumCents,
} from '../lib/financial-insights.logic';
import {
  chartSeriesHasValues,
  mergeRevenueExpenseChartSeries,
} from '@synq/evaluations-insights/evaluations-chart-series';
import { isIncomingInvoice, isOutgoingInvoice } from '../components/invoices/invoiceClassification';

export interface EvaluationsInvoiceLite {
  id: string;
  invoiceNumber: number | null;
  type: string;
  status: string;
  customerId: string | null;
  vendorName: string | null;
  vehicleId: string | null;
  bookingId: string | null;
  title: string | null;
  totalCents: number | null;
  subtotalCents: number | null;
  taxCents: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
}

export interface EvaluationsCustomerLite {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1, 0, 0, 0, 0);
}

function endOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function effectiveDateOf(inv: EvaluationsInvoiceLite): Date | null {
  return parseDate(inv.invoiceDate) || parseDate(inv.createdAt);
}

export function customerLabel(c: EvaluationsCustomerLite | undefined): string {
  if (!c) return '—';
  const composed = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return c.name || composed || c.email || c.id.slice(0, 8);
}

export function useEvaluationsInvoiceData(orgId: string | null) {
  const [loading, setLoading] = useState(true);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [customerLoadWarning, setCustomerLoadWarning] = useState<string | null>(null);
  const [reportingAnchor, setReportingAnchor] = useState(() => new Date());
  const [invoices, setInvoices] = useState<EvaluationsInvoiceLite[]>([]);
  const [customers, setCustomers] = useState<EvaluationsCustomerLite[]>([]);

  const load = useCallback(async () => {
    if (!orgId) {
      setInvoices([]);
      setCustomers([]);
      setLoading(false);
      return;
    }
    setInvoiceError(null);
    setCustomerLoadWarning(null);
    try {
      let invoicesArr: EvaluationsInvoiceLite[] = [];
      try {
        const iList = await api.invoices.list(orgId);
        invoicesArr = Array.isArray(iList) ? (iList as EvaluationsInvoiceLite[]) : [];
      } catch {
        invoicesArr = [];
        setInvoiceError('invoice_load_failed');
      }

      let customersArr: EvaluationsCustomerLite[] = [];
      try {
        const cList = await api.customers.list(orgId);
        customersArr = Array.isArray(cList)
          ? (cList as EvaluationsCustomerLite[])
          : ((cList as { data?: EvaluationsCustomerLite[] })?.data ?? []);
      } catch {
        customersArr = [];
        setCustomerLoadWarning('customer_load_failed');
      }

      setInvoices(invoicesArr);
      setCustomers(customersArr);
      setReportingAnchor(new Date());
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const now = reportingAnchor;
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const prevMonthStart = useMemo(() => startOfPrevMonth(now), [now]);
  const prevMonthEnd = useMemo(() => endOfPrevMonth(now), [now]);

  const bucketed = useMemo(() => {
    const outstandingRevenue = openOutgoingReceivables(invoices, now);
    const overdueRevenue = overdueOutgoingReceivables(invoices, now);
    const mtdRevenueRows = mtdRevenueInRange(invoices, monthStart, now);
    const mtdPaid = paidRevenueInRange(invoices, monthStart, now);
    const mtdExpenseRows = expensesInRange(invoices, monthStart, now);
    const prevRevenueRows = mtdRevenueInRange(invoices, prevMonthStart, prevMonthEnd);

    return {
      mtdRevenue: mtdRevenueRows,
      mtdExpense: mtdExpenseRows,
      prevRevenue: prevRevenueRows,
      prevExpense: expensesInRange(invoices, prevMonthStart, prevMonthEnd),
      outstandingRevenue,
      overdueRevenue,
      mtdPaid,
      mtdInvoices: mtdRevenueRows,
    };
  }, [invoices, monthStart, prevMonthStart, prevMonthEnd, now]);

  const mtdRevenueCents = useMemo(() => sumCents(bucketed.mtdRevenue), [bucketed.mtdRevenue]);
  const mtdPaidRevenueCents = useMemo(() => sumCents(bucketed.mtdPaid), [bucketed.mtdPaid]);
  const mtdExpenseCents = useMemo(() => sumCents(bucketed.mtdExpense), [bucketed.mtdExpense]);
  const prevRevenueCents = useMemo(() => sumCents(bucketed.prevRevenue), [bucketed.prevRevenue]);
  const prevExpenseCents = useMemo(() => sumCents(bucketed.prevExpense), [bucketed.prevExpense]);
  const outstandingCents = useMemo(() => sumCents(bucketed.outstandingRevenue), [bucketed.outstandingRevenue]);
  const overdueCents = useMemo(() => sumCents(bucketed.overdueRevenue), [bucketed.overdueRevenue]);
  const profitCents = mtdRevenueCents - mtdExpenseCents;
  const profitMargin = mtdRevenueCents > 0 ? (profitCents / mtdRevenueCents) * 100 : 0;
  const mtdOpenInvoices = useMemo(
    () => bucketed.mtdInvoices.filter((inv) => inv.status !== 'PAID' && inv.status !== 'CANCELLED').length,
    [bucketed.mtdInvoices],
  );
  const hasPaidCashflowData = bucketed.mtdPaid.length > 0;

  const revenueDeltaPct =
    prevRevenueCents > 0 ? ((mtdRevenueCents - prevRevenueCents) / prevRevenueCents) * 100 : null;
  const expenseDeltaPct =
    prevExpenseCents > 0 ? ((mtdExpenseCents - prevExpenseCents) / prevExpenseCents) * 100 : null;

  const dailySeries = useMemo(() => {
    const days = daysInMonth(now.getFullYear(), now.getMonth());
    const revenueObs: Array<{ dayIndex: number; value: number }> = [];
    const expenseObs: Array<{ dayIndex: number; value: number }> = [];
    for (const inv of bucketed.mtdRevenue) {
      const d = effectiveDateOf(inv);
      if (!d) continue;
      revenueObs.push({ dayIndex: d.getDate() - 1, value: (inv.totalCents ?? 0) / 100 });
    }
    for (const inv of bucketed.mtdExpense) {
      const d = effectiveDateOf(inv);
      if (!d) continue;
      expenseObs.push({ dayIndex: d.getDate() - 1, value: (inv.totalCents ?? 0) / 100 });
    }
    return mergeRevenueExpenseChartSeries({
      dayCount: days,
      dayKey: (i) => String(i + 1),
      revenueObservations: revenueObs,
      expenseObservations: expenseObs,
      dataUnavailable: Boolean(invoiceError),
    });
  }, [bucketed.mtdRevenue, bucketed.mtdExpense, now, invoiceError]);

  const hasDailyData = useMemo(() => chartSeriesHasValues(dailySeries), [dailySeries]);

  const customerById = useMemo(() => {
    const m = new Map<string, EvaluationsCustomerLite>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const topCustomers = useMemo(() => {
    const tally = new Map<string, { id: string; revenueCents: number; invoiceCount: number }>();
    for (const inv of bucketed.mtdRevenue) {
      if (!inv.customerId) continue;
      const prev = tally.get(inv.customerId) ?? { id: inv.customerId, revenueCents: 0, invoiceCount: 0 };
      prev.revenueCents += inv.totalCents ?? 0;
      prev.invoiceCount += 1;
      tally.set(inv.customerId, prev);
    }
    return [...tally.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5);
  }, [bucketed.mtdRevenue]);

  const topVehicles = useMemo(() => {
    const tally = new Map<string, { id: string; revenueCents: number; invoiceCount: number }>();
    for (const inv of bucketed.mtdRevenue) {
      if (!inv.vehicleId) continue;
      const prev = tally.get(inv.vehicleId) ?? { id: inv.vehicleId, revenueCents: 0, invoiceCount: 0 };
      prev.revenueCents += inv.totalCents ?? 0;
      prev.invoiceCount += 1;
      tally.set(inv.vehicleId, prev);
    }
    return [...tally.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5);
  }, [bucketed.mtdRevenue]);

  const recentActivity = useMemo(() => {
    return [...invoices]
      .filter((inv) => isOutgoingInvoice(inv.type) || isIncomingInvoice(inv.type))
      .sort((a, b) => {
        const da = effectiveDateOf(a)?.getTime() ?? 0;
        const db = effectiveDateOf(b)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 8);
  }, [invoices]);

  return {
    loading,
    invoiceError,
    customerLoadWarning,
    reportingAnchor,
    invoices,
    customers,
    customerById,
    bucketed,
    mtdRevenueCents,
    mtdPaidRevenueCents,
    mtdExpenseCents,
    outstandingCents,
    overdueCents,
    profitCents,
    profitMargin,
    mtdOpenInvoices,
    hasPaidCashflowData,
    revenueDeltaPct,
    expenseDeltaPct,
    dailySeries,
    hasDailyData,
    topCustomers,
    topVehicles,
    recentActivity,
    refresh: load,
  };
}

export type EvaluationsInvoiceDataHookResult = ReturnType<typeof useEvaluationsInvoiceData>;
