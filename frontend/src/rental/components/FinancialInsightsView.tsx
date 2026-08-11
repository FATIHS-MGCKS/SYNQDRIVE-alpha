import { ArrowDownLeft, ArrowUpRight, Clock, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '../../lib/api';
import { PageHeader } from '../../components/patterns';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';
import { useLanguage } from '../i18n/LanguageContext';
import { stationFilterToDashboardId } from '../lib/fleet-station-filter';
import { useFleetMapStore } from '../stores/useFleetMapStore';
import { filterFleetByStation } from './dashboard/dashboardUtils';
import { InsightsCockpit } from './insights/InsightsCockpit';
import {
  expensesInRange,
  mtdRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  paidRevenueInRange,
} from '../lib/financial-insights.logic';
import {
  formatFinanceMoney,
  formatFinancePercent,
  formatRawMoney,
  isMoneyAvailable,
  readMoneyMetric,
  readPercentMetric,
} from '../lib/finance-insights-adapter';
import {
  FINANCE_CORE_METRIC_IDS,
  type FinancialInsightsBundleDto,
} from '../lib/finance-insights.types';

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * Lightweight invoice shape consumed by the Financial Insights view.
 * Mirrors the backend `OrgInvoice` row exposed via `/organizations/:orgId/invoices`
 * — every field is optional/null-tolerant because legacy rows occasionally
 * miss some columns and we never want to crash an aggregate dashboard on a
 * single bad invoice.
 */
interface InvoiceLite {
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
  paidCents: number | null;
  outstandingCents: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  issuedAt: string | null;
  createdAt: string | null;
}

interface CustomerLite {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}

interface FinancialInsightsViewProps {
  isDarkMode: boolean;
}

import {
  isIncomingInvoice,
  isOutgoingInvoice,
} from './invoices/invoiceClassification';

const TYPE_META: Record<string, { label: string; icon: typeof ArrowUpRight; tone: 'revenue' | 'expense' }> = {
  OUTGOING_BOOKING: { label: 'Booking invoice', icon: ArrowUpRight, tone: 'revenue' },
  OUTGOING_MANUAL: { label: 'Manual invoice', icon: ArrowUpRight, tone: 'revenue' },
  OUTGOING_FINAL: { label: 'Final invoice', icon: ArrowUpRight, tone: 'revenue' },
  INCOMING_VENDOR: { label: 'Vendor invoice', icon: ArrowDownLeft, tone: 'expense' },
  INCOMING_UPLOADED: { label: 'Uploaded invoice', icon: ArrowDownLeft, tone: 'expense' },
};

const STATUS_META: Record<string, { label: string; tone: 'paid' | 'unpaid' | 'overdue' | 'neutral' }> = {
  PAID: { label: 'Paid', tone: 'paid' },
  SENT: { label: 'Sent', tone: 'unpaid' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  OVERDUE: { label: 'Overdue', tone: 'overdue' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

// ─── Helpers ───────────────────────────────────────────────────────────

const fmtEUR = (cents: number, locale = 'de-DE'): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);

const fmtEURFull = (cents: number, locale = 'de-DE'): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(cents / 100);

const fmtPct = (value: number, digits = 1): string =>
  `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(digits)}%`;

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

function effectiveDateOf(inv: InvoiceLite): Date | null {
  return parseDate(inv.invoiceDate) || parseDate(inv.createdAt);
}

function customerLabel(c: CustomerLite | undefined): string {
  if (!c) return '—';
  const composed = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return c.name || composed || c.email || c.id.slice(0, 8);
}

// ─── Component ─────────────────────────────────────────────────────────

/**
 * Financial Insights — standalone view inside the "Insights" sidebar group.
 *
 * V4.6.93 — Replaces the old Dashboard Finances tab. The Dashboard now hosts
 * only operational signals; everything finance-driven (Revenue MTD, Expenses
 * MTD, Profit, Outstanding, daily breakdown, top customers/vehicles) lives
 * here as a first-class Insights surface and is wired end-to-end to the real
 * `/organizations/:orgId/invoices` endpoint — no mock data, no synthetic timeseries, no hardcoded category
 * lists, no fabricated AI commentary.
 */
export function FinancialInsightsView({ isDarkMode }: FinancialInsightsViewProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const { t, locale } = useLanguage();
  const stationFilter = useFleetMapStore((state) => state.filters.stationId);
  const selectedStationId = useMemo(
    () => stationFilterToDashboardId(stationFilter),
    [stationFilter],
  );
  const scopedVehicleIds = useMemo(() => {
    if (!selectedStationId) return null;
    return new Set(filterFleetByStation(fleetVehicles, selectedStationId).map((v) => v.id));
  }, [fleetVehicles, selectedStationId]);

  const localeMap: Record<string, string> = {
    en: 'en-US', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL',
    es: 'es-ES', it: 'it-IT', pl: 'pl-PL', cs: 'cs-CZ',
  };
  const intlLocale = localeMap[locale] || 'en-US';

  const [loading, setLoading] = useState(true);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [customerLoadWarning, setCustomerLoadWarning] = useState<string | null>(null);
  const [reportingAnchor, setReportingAnchor] = useState(() => new Date());
  const [invoices, setInvoices] = useState<InvoiceLite[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  // Canonical E3 finance bundle — single authority for the core KPIs.
  const [financeBundle, setFinanceBundle] = useState<FinancialInsightsBundleDto | null>(null);
  const loadGenRef = useRef(0);
  const [activePopup, setActivePopup] = useState<'revenue' | 'expenses' | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const scopedInvoices = useMemo(() => {
    if (!scopedVehicleIds) return invoices;
    return invoices.filter((inv) => inv.vehicleId && scopedVehicleIds.has(inv.vehicleId));
  }, [invoices, scopedVehicleIds]);

  const load = useCallback(async () => {
    // Generation guard: a later station/org change invalidates an in-flight load
    // so a stale response can never overwrite the currently-selected scope.
    const gen = loadGenRef.current + 1;
    loadGenRef.current = gen;
    const isStale = () => gen !== loadGenRef.current;

    if (!orgId) {
      setInvoices([]);
      setCustomers([]);
      setFinanceBundle(null);
      setLoading(false);
      return;
    }
    setInvoiceError(null);
    setCustomerLoadWarning(null);
    // The selected station is a REQUESTED narrowing only; backend E2 remains the
    // authorization authority. When no station is selected the request is org-wide.
    const requestedStationIds = selectedStationId ? [selectedStationId] : undefined;
    try {
      let invoicesArr: InvoiceLite[] = [];
      try {
        const iList = await api.invoices.list(orgId);
        invoicesArr = Array.isArray(iList) ? (iList as InvoiceLite[]) : [];
      } catch {
        invoicesArr = [];
        if (!isStale()) setInvoiceError('Finanzdaten konnten nicht geladen werden.');
      }

      let customersArr: CustomerLite[] = [];
      try {
        const cList = await api.customers.list(orgId);
        customersArr = Array.isArray(cList)
          ? (cList as CustomerLite[])
          : ((cList as { data?: CustomerLite[] })?.data ?? []);
      } catch {
        customersArr = [];
        if (!isStale())
          setCustomerLoadWarning('Kundendaten konnten nicht geladen werden — Zuordnungen können unvollständig sein.');
      }

      // Core finance KPIs come exclusively from the canonical E3 backend endpoint
      // (single truth) for the SAME requested scope as the rest of the surface. On
      // failure / station-scoped fail-closed they render as unavailable — never a
      // client-recomputed fallback, never an org-wide fallback, never a false zero.
      try {
        const bundle = await api.evaluations.financeInsights(orgId, requestedStationIds);
        if (!isStale()) setFinanceBundle(bundle);
      } catch {
        if (!isStale()) setFinanceBundle(null);
      }

      if (!isStale()) {
        setInvoices(invoicesArr);
        setCustomers(customersArr);
        setReportingAnchor(new Date());
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [orgId, selectedStationId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // ─── Derived: time slices ────────────────────────────────────────────

  const now = reportingAnchor;
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const prevMonthStart = useMemo(() => startOfPrevMonth(now), [now]);
  const prevMonthEnd = useMemo(() => endOfPrevMonth(now), [now]);

  // Bucket invoices by current vs previous month and by direction so we can
  // compute MTD KPIs + month-over-month deltas without re-iterating the list.
  const bucketed = useMemo(() => {
    const outstandingRevenue = openOutgoingReceivables(scopedInvoices, now);
    const overdueRevenue = overdueOutgoingReceivables(scopedInvoices, now);
    const mtdRevenueRows = mtdRevenueInRange(scopedInvoices, monthStart, now);
    const mtdPaid = paidRevenueInRange(scopedInvoices, monthStart, now);
    const mtdExpenseRows = expensesInRange(scopedInvoices, monthStart, now);
    const prevRevenueRows = mtdRevenueInRange(scopedInvoices, prevMonthStart, prevMonthEnd);

    return {
      mtdRevenue: mtdRevenueRows,
      mtdExpense: mtdExpenseRows,
      prevRevenue: prevRevenueRows,
      prevExpense: expensesInRange(scopedInvoices, prevMonthStart, prevMonthEnd),
      outstandingRevenue,
      overdueRevenue,
      mtdPaid,
      mtdInvoices: mtdRevenueRows,
    };
  }, [scopedInvoices, monthStart, prevMonthStart, prevMonthEnd, now]);

  // ─── Canonical E3 core KPI views (backend authority; display only) ───────
  // The client performs NO revenue/expense/receivable/result/margin calculation.
  const revenueView = useMemo(
    () => readMoneyMetric(financeBundle, FINANCE_CORE_METRIC_IDS.issuedRevenue),
    [financeBundle],
  );
  const paidView = useMemo(
    () => readMoneyMetric(financeBundle, FINANCE_CORE_METRIC_IDS.paidRevenue),
    [financeBundle],
  );
  const expenseView = useMemo(
    () => readMoneyMetric(financeBundle, FINANCE_CORE_METRIC_IDS.expenses),
    [financeBundle],
  );
  const netResultView = useMemo(
    () => readMoneyMetric(financeBundle, FINANCE_CORE_METRIC_IDS.netResult),
    [financeBundle],
  );
  const marginView = useMemo(
    () => readPercentMetric(financeBundle, FINANCE_CORE_METRIC_IDS.profitMargin),
    [financeBundle],
  );
  const openView = useMemo(
    () => readMoneyMetric(financeBundle, FINANCE_CORE_METRIC_IDS.openReceivables),
    [financeBundle],
  );
  const overdueView = useMemo(
    () => readMoneyMetric(financeBundle, FINANCE_CORE_METRIC_IDS.overdueReceivables),
    [financeBundle],
  );
  const netResultPositive = !isMoneyAvailable(netResultView) || (netResultView.amountMinor ?? 0) >= 0;
  const mtdOpenInvoices = useMemo(
    () => bucketed.mtdInvoices.filter((inv) => inv.status !== 'PAID' && inv.status !== 'CANCELLED').length,
    [bucketed.mtdInvoices],
  );
  // Month-over-month comparison has no canonical backend authority yet → not
  // recomputed in the browser (no second period-comparison formula).
  const revenueDeltaPct = null;
  const expenseDeltaPct = null;

  // ─── Derived: daily chart series ─────────────────────────────────────

  const dailySeries = useMemo(() => {
    const days = daysInMonth(now.getFullYear(), now.getMonth());
    const out: { day: string; dayNum: number; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 0; i < days; i++) {
      out.push({ day: String(i + 1), dayNum: i + 1, revenue: 0, expenses: 0, profit: 0 });
    }
    for (const inv of bucketed.mtdRevenue) {
      const d = effectiveDateOf(inv);
      if (!d) continue;
      const dayIdx = d.getDate() - 1;
      if (dayIdx >= 0 && dayIdx < out.length) {
        out[dayIdx].revenue += (inv.totalCents ?? 0) / 100;
      }
    }
    for (const inv of bucketed.mtdExpense) {
      const d = effectiveDateOf(inv);
      if (!d) continue;
      const dayIdx = d.getDate() - 1;
      if (dayIdx >= 0 && dayIdx < out.length) {
        out[dayIdx].expenses += (inv.totalCents ?? 0) / 100;
      }
    }
    for (const row of out) row.profit = row.revenue - row.expenses;
    return out;
  }, [bucketed.mtdRevenue, bucketed.mtdExpense, now]);

  const hasDailyData = useMemo(
    () => dailySeries.some((d) => d.revenue > 0 || d.expenses > 0),
    [dailySeries],
  );

  // ─── Derived: lookups ────────────────────────────────────────────────

  const customerById = useMemo(() => {
    const m = new Map<string, CustomerLite>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const vehicleById = useMemo(() => {
    const m = new Map<string, { license: string; model: string }>();
    for (const v of fleetVehicles) {
      m.set(v.id, { license: v.license || '', model: `${v.make ?? ''} ${v.model ?? ''}`.trim() });
    }
    return m;
  }, [fleetVehicles]);

  // ─── Derived: top revenue customers + vehicles (real, no mock) ───────

  const topCustomers = useMemo(() => {
    const tally = new Map<string, { id: string; revenueCents: number; invoiceCount: number }>();
    for (const inv of bucketed.mtdRevenue) {
      if (!inv.customerId) continue;
      const prev = tally.get(inv.customerId) ?? { id: inv.customerId, revenueCents: 0, invoiceCount: 0 };
      prev.revenueCents += inv.totalCents ?? 0;
      prev.invoiceCount += 1;
      tally.set(inv.customerId, prev);
    }
    return [...tally.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);
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
    return [...tally.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);
  }, [bucketed.mtdRevenue]);

  // ─── Derived: per-day breakdown for popups ───────────────────────────

  type DailyBreakdownDay = {
    iso: string;
    label: string;
    weekday: string;
    totalCents: number;
    items: InvoiceLite[];
  };

  const buildDailyBreakdown = (rows: InvoiceLite[]): DailyBreakdownDay[] => {
    const map = new Map<string, DailyBreakdownDay>();
    for (const inv of rows) {
      const d = effectiveDateOf(inv);
      if (!d) continue;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const existing = map.get(iso);
      if (existing) {
        existing.totalCents += inv.totalCents ?? 0;
        existing.items.push(inv);
      } else {
        map.set(iso, {
          iso,
          label: d.toLocaleDateString(intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
          weekday: d.toLocaleDateString(intlLocale, { weekday: 'short' }),
          totalCents: inv.totalCents ?? 0,
          items: [inv],
        });
      }
    }
    return [...map.values()].sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
  };

  const revenueByDay = useMemo(() => buildDailyBreakdown(bucketed.mtdRevenue), [bucketed.mtdRevenue, intlLocale]);
  const expensesByDay = useMemo(() => buildDailyBreakdown(bucketed.mtdExpense), [bucketed.mtdExpense, intlLocale]);

  // ─── Derived: recent activity (whole org, last 8) ────────────────────

  const recentActivity = useMemo(() => {
    return [...scopedInvoices]
      .filter((inv) => isOutgoingInvoice(inv.type) || isIncomingInvoice(inv.type))
      .sort((a, b) => {
        const da = effectiveDateOf(a)?.getTime() ?? 0;
        const db = effectiveDateOf(b)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 8);
  }, [scopedInvoices]);

  // ─── Render ──────────────────────────────────────────────────────────

  // Period label follows the backend E1 period authority (its effective
  // timezone), so the KPI period does not depend on the browser timezone.
  const monthLabel = useMemo(() => {
    const period = financeBundle?.period;
    if (period?.reference) {
      const ref = new Date(period.reference);
      const tz = period.timezone?.effectiveTimezone;
      if (!Number.isNaN(ref.getTime())) {
        return ref.toLocaleDateString(intlLocale, {
          month: 'long',
          year: 'numeric',
          ...(tz ? { timeZone: tz } : {}),
        });
      }
    }
    return now.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' });
  }, [financeBundle, intlLocale, now]);

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-5" data-testid="evaluations-page">
        <PageHeader title={t('nav.financialInsights')} />
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <Icon name="loader-2" className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{t('common.loading') ?? 'Loading…'}</p>
        </div>
      </div>
    );
  }

  // E3.4: a raw invoice-detail failure must NOT suppress canonical Core Finance.
  // The canonical KPI cards render from `financeBundle` independently; the invoice
  // error is shown as a non-blocking banner affecting only the detail/legacy areas.

  return (
    <div className="max-w-[1600px] mx-auto space-y-5" data-testid="evaluations-page">
      <PageHeader title={t('nav.financialInsights')} />
      <InsightsCockpit
        isDarkMode={isDarkMode}
        stationId={selectedStationId}
        openReceivables={openView}
      />

      <div className="pt-2 border-t border-border">
        <h2 className="text-[14px] font-bold text-foreground mb-1">Financial Intelligence</h2>
        <p className="text-[11px] text-muted-foreground mb-4">
          Ausgestellte Rechnungen (Issued) nach Rechnungsdatum · Cashflow nur bei erfasstem Zahlungsdatum
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold sq-tone-neutral">
          {monthLabel}
        </span>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold sq-tone-brand">
          {scopedInvoices.length} invoices
        </span>
      </div>

      {invoiceError && (
        <div className="rounded-xl p-3 flex items-center gap-2 sq-tone-warning">
          <Icon name="alert-circle" className="w-4 h-4" />
          <p className="text-xs font-medium">
            {invoiceError} — Detailtabellen/Aktivität eingeschränkt; die kanonischen Kern-KPIs oben bleiben gültig.
          </p>
        </div>
      )}

      {customerLoadWarning && (
        <div className="rounded-xl p-3 flex items-center gap-2 sq-tone-warning">
          <Icon name="alert-circle" className="w-4 h-4" />
          <p className="text-xs font-medium">{customerLoadWarning}</p>
        </div>
      )}

      {/* ─── KPI Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {/* E3.3: Core KPI cards are display-only over canonical backend values.
            No client-derived contributing counts/drilldown are attached (they used
            different, non-canonical semantics — issued∪paid mixing / scope drift),
            so no misleading breakdown is shown (correct absence > wrong drilldown). */}
        <KpiCard
          label="Issued Revenue MTD"
          value={formatFinanceMoney(revenueView, intlLocale)}
          icon={ArrowUpRight}
          color="green"
          isDarkMode={isDarkMode}
          delta={revenueDeltaPct}
          subtle="Finalisierte Rechnungen (canonical)"
        />
        <KpiCard
          label="Expenses MTD"
          value={formatFinanceMoney(expenseView, intlLocale)}
          icon={ArrowDownLeft}
          color="red"
          isDarkMode={isDarkMode}
          delta={expenseDeltaPct}
          deltaInverted
          subtle="Freigegebene Ausgaben (canonical)"
        />
        <KpiCard
          label="Net Profit MTD"
          value={formatFinanceMoney(netResultView, intlLocale)}
          icon={Wallet}
          color={netResultPositive ? 'blue' : 'red'}
          isDarkMode={isDarkMode}
          subtle={`Margin ${formatFinancePercent(marginView, 1)} · Issued Revenue`}
        />
        <KpiCard
          label="Open Receivables"
          value={formatFinanceMoney(openView, intlLocale)}
          icon={Clock}
          color="purple"
          isDarkMode={isDarkMode}
          subtle="Offener Saldo (canonical)"
        />
        <KpiCard
          label="Overdue"
          value={formatFinanceMoney(overdueView, intlLocale)}
          icon={Clock}
          color="red"
          isDarkMode={isDarkMode}
          subtle="Überfälliger Saldo (canonical)"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <SummaryCard
          label="Paid revenue MTD"
          value={formatFinanceMoney(paidView, intlLocale)}
          hint="Payment Ledger (settled)"
        />
        <SummaryCard label="Expense invoices" value={String(bucketed.mtdExpense.length)} hint={monthLabel} />
        <SummaryCard label="Paid invoices MTD" value={String(bucketed.mtdPaid.length)} hint="nach paidAt" />
        <SummaryCard label="Open invoices" value={String(mtdOpenInvoices)} hint="This month" />
      </div>

      {/* ─── Daily chart ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
                Daily Revenue &amp; Expenses
                <span className="ml-2 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wider sq-tone-neutral align-middle">
                  Limited · non-canonical
                </span>
              </h3>
              <p className="text-[10px] mt-0.5 text-muted-foreground">
                {monthLabel} · daily breakdown (legacy presentation, not an E3 canonical metric)
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="text-right">
                <div className="text-[10px] font-medium text-muted-foreground">Revenue</div>
                <div className="text-[11px] font-bold text-[color:var(--status-success)]">{formatFinanceMoney(revenueView, intlLocale)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-medium text-muted-foreground">Expenses</div>
                <div className="text-[11px] font-bold text-[color:var(--status-critical)]">{formatFinanceMoney(expenseView, intlLocale)}</div>
              </div>
            </div>
          </div>
          <div className="relative">
            {!hasDailyData && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="px-4 py-2 rounded-xl surface-premium/90 border border-border text-center shadow-[var(--shadow-1)]">
                  <p className="text-xs font-semibold text-foreground">No invoices recorded this month yet</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Daily revenue & expenses will appear once invoices are issued.</p>
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailySeries} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="finRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="finExpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDarkMode ? 'rgba(55,65,81,0.4)' : 'rgba(229,231,235,0.6)'}
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  stroke={isDarkMode ? '#6b7280' : '#9ca3af'}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={isDarkMode ? '#6b7280' : '#9ca3af'}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `€${(v / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDarkMode ? 'rgba(23,23,23,0.95)' : 'rgba(255,255,255,0.95)',
                    border: 'none',
                    borderRadius: '14px',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                    backdropFilter: 'blur(20px)',
                    padding: '10px 14px',
                  }}
                  labelStyle={{ color: isDarkMode ? '#fff' : '#111', fontWeight: 700, fontSize: 12, marginBottom: 4 }}
                  itemStyle={{ fontSize: 11, padding: '1px 0' }}
                  formatter={(value, name) => {
                    const v = typeof value === 'number' ? value : Number(value) || 0;
                    const key = String(name);
                    return [
                      `€${v.toLocaleString(intlLocale)}`,
                      key === 'revenue' ? 'Revenue' : key === 'expenses' ? 'Expenses' : 'Profit',
                    ];
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#finRevGrad)" dot={false} />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={1.5} fill="url(#finExpGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Margin / outstanding sidebar card */}
        <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center sq-tone-brand">
              <Icon name="target" className="w-4 h-4" />
            </div>
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Snapshot</h3>
          </div>
          <dl className="space-y-3">
            <SnapRow label="Profit margin">
              <span className={`text-xs font-bold ${netResultPositive ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-critical)]'}`}>
                {formatFinancePercent(marginView, 1)}
              </span>
            </SnapRow>
            {/* MoM deltas have no canonical backend comparison authority yet →
                shown as unavailable (no second client period-comparison formula). */}
            <SnapRow label="MoM revenue">
              <span className="text-xs text-muted-foreground">—</span>
            </SnapRow>
            <SnapRow label="MoM expenses">
              <span className="text-xs text-muted-foreground">—</span>
            </SnapRow>
            <SnapRow label="Outstanding">
              <span className="text-xs font-bold text-foreground">{formatFinanceMoney(openView, intlLocale)}</span>
            </SnapRow>
            <SnapRow label="Avg invoice">
              {/* avg_invoice_value_mtd has no canonical backend owner yet → not
                  recomputed client-side (downgraded to non-canonical). */}
              <span className="text-xs font-bold text-muted-foreground">—</span>
            </SnapRow>
          </dl>
        </div>
      </div>

      {/* ─── Top customers + top vehicles + recent activity ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ListCard
          title="Top customers (MTD) · Limited"
          icon={TrendingUp}
          tone="green"
          isDarkMode={isDarkMode}
          empty={topCustomers.length === 0}
          emptyHint="No paid customer invoices in the current month."
        >
          {topCustomers.map((row, idx) => (
            <ListRow
              key={row.id}
              rank={idx + 1}
              primary={customerLabel(customerById.get(row.id))}
              secondary={`${row.invoiceCount} invoice${row.invoiceCount === 1 ? '' : 's'}`}
              value={fmtEUR(row.revenueCents, intlLocale)}
              valueTone="positive"
              isDarkMode={isDarkMode}
            />
          ))}
        </ListCard>

        <ListCard
          title="Top vehicles (MTD) · Limited"
          icon={TrendingUp}
          tone="blue"
          isDarkMode={isDarkMode}
          empty={topVehicles.length === 0}
          emptyHint="No vehicle-attributed invoices in the current month."
        >
          {topVehicles.map((row, idx) => {
            const v = vehicleById.get(row.id);
            return (
              <ListRow
                key={row.id}
                rank={idx + 1}
                primary={v?.license || row.id.slice(0, 8)}
                secondary={v?.model || `${row.invoiceCount} invoice${row.invoiceCount === 1 ? '' : 's'}`}
                value={fmtEUR(row.revenueCents, intlLocale)}
                valueTone="positive"
                isDarkMode={isDarkMode}
              />
            );
          })}
        </ListCard>

        <ListCard
          title="Recent activity"
          icon={Receipt}
          tone="neutral"
          isDarkMode={isDarkMode}
          empty={recentActivity.length === 0}
          emptyHint="No invoices yet."
        >
          {recentActivity.map((inv) => {
            const meta = TYPE_META[inv.type] ?? { label: inv.type, icon: Receipt, tone: 'expense' as const };
            const Icon = meta.icon;
            const status = STATUS_META[inv.status] ?? STATUS_META.DRAFT;
            const d = effectiveDateOf(inv);
            return (
              <div
                key={inv.id}
                className="rounded-md px-2 py-2 flex items-center gap-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                  meta.tone === 'revenue' ? 'sq-tone-success' : 'sq-tone-warning'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-foreground truncate">
                      {inv.title || meta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      #{inv.invoiceNumber ?? inv.id.slice(0, 6)}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground truncate">
                    {d ? d.toLocaleDateString(intlLocale, { day: '2-digit', month: 'short' }) : '—'}
                    {' · '}
                    {inv.vendorName || customerLabel(inv.customerId ? customerById.get(inv.customerId) : undefined)}
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`text-[12px] font-bold ${meta.tone === 'revenue' ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-attention)]'}`}>
                    {formatRawMoney(inv.totalCents, inv.currency, intlLocale)}
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded ${
                      status.tone === 'paid'
                        ? 'sq-tone-success'
                        : status.tone === 'overdue'
                          ? 'sq-tone-critical'
                          : status.tone === 'unpaid'
                            ? 'sq-tone-brand'
                            : 'sq-tone-neutral'
                    }`}
                  >
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
        </ListCard>
      </div>

      {/* E3.3: Core KPI drill-down popups removed — they used non-canonical,
          issued∪paid client rows that do not reconcile with the canonical Core
          KPI values. A canonical contribution drilldown is deferred (E4/E6). */}
    </div>
  );
}

// ─── Reusable bits ─────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, color, delta, deltaInverted, subtle, onClick, clickable,
}: {
  label: string;
  value: string;
  icon: typeof ArrowUpRight;
  color: 'green' | 'red' | 'blue' | 'purple';
  isDarkMode: boolean;
  delta?: number | null;
  deltaInverted?: boolean;
  subtle?: string;
  onClick?: () => void;
  clickable?: boolean;
}) {
  const toneClass =
    color === 'green'
      ? 'sq-tone-success'
      : color === 'red'
        ? 'sq-tone-critical'
        : color === 'blue'
          ? 'sq-tone-brand'
          : 'sq-tone-warning';

  const deltaDisplay = (() => {
    if (delta == null) return null;
    const positive = delta >= 0;
    const goodDirection = deltaInverted ? !positive : positive;
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${goodDirection ? 'sq-tone-success' : 'sq-tone-critical'}`}>
        {positive ? '▲' : '▼'} {fmtPct(Math.abs(delta), 1)}
      </span>
    );
  })();

  const Wrapper: any = clickable ? 'button' : 'div';
  return (
    <Wrapper
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      className={`text-left rounded-xl p-3 transition-all duration-200 flex flex-col ${toneClass} ${
        clickable ? 'cursor-pointer hover:opacity-90 hover:shadow-sm' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-current/10">
          <Icon className="w-4 h-4" />
        </div>
        {deltaDisplay}
      </div>
      <div className="text-[16px] font-bold leading-tight tabular-nums">{value}</div>
      <div className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75">{label}</div>
      {subtle && (
        <div className="text-[10px] mt-2 pt-2 border-t border-current/15 flex items-center justify-between opacity-80">
          <span>{subtle}</span>
          {clickable && <Icon name="arrow-right" className="w-3.5 h-3.5" />}
        </div>
      )}
    </Wrapper>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl p-3 border border-border/60 surface-premium flex items-center justify-between">
      <div>
        <div className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
        {hint && <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">{hint}</div>}
      </div>
      <div className="text-[13px] font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function SnapRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[11.5px] font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ListCard({
  title, icon: Icon, tone, empty, emptyHint, children,
}: {
  title: string;
  icon: typeof TrendingUp;
  tone: 'green' | 'blue' | 'red' | 'neutral';
  isDarkMode: boolean;
  empty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === 'green'
      ? 'sq-tone-success'
      : tone === 'blue'
        ? 'sq-tone-brand'
        : tone === 'red'
          ? 'sq-tone-critical'
          : 'sq-tone-neutral';

  return (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${toneCls}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">{title}</h3>
      </div>
      {empty ? (
        <div className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center">
          <Icon name="check-circle" className="w-4 h-4 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}

function ListRow({
  rank, primary, secondary, value, valueTone,
}: {
  rank: number;
  primary: string;
  secondary?: string;
  value: string;
  valueTone: 'positive' | 'neutral';
  isDarkMode: boolean;
}) {
  const rankCls = rank === 1
    ? 'sq-tone-warning'
    : rank === 2
      ? 'sq-tone-brand'
      : rank === 3
        ? 'sq-tone-success'
        : 'sq-tone-neutral';
  const valueCls = valueTone === 'positive'
    ? 'text-[color:var(--status-success)]'
    : 'text-foreground';
  return (
    <div className="rounded-md px-2 py-2 flex items-center gap-2.5">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${rankCls}`}>{rank}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-foreground truncate">{primary}</div>
        {secondary && <div className="text-[10.5px] text-muted-foreground truncate">{secondary}</div>}
      </div>
      <div className={`text-[12px] font-bold tabular-nums ${valueCls}`}>{value}</div>
    </div>
  );
}

// ─── Drill-down popup ──────────────────────────────────────────────────

function BreakdownPopup({
  title, monthLabel, totalCents, tone, days, expandedDay, onExpand, onClose,
  isDarkMode, intlLocale, customerById, vehicleById,
}: {
  title: string;
  monthLabel: string;
  totalCents: number;
  tone: 'revenue' | 'expense';
  days: { iso: string; label: string; weekday: string; totalCents: number; items: InvoiceLite[] }[];
  expandedDay: string | null;
  onExpand: (iso: string) => void;
  onClose: () => void;
  isDarkMode: boolean;
  intlLocale: string;
  customerById: Map<string, CustomerLite>;
  vehicleById: Map<string, { license: string; model: string }>;
}) {
  const totalCls = tone === 'revenue' ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-attention)]';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 overlay-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evaluations-breakdown-title"
        data-testid="evaluations-breakdown-dialog"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl p-5 shadow-2xl surface-premium border border-border"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Schließen"
        >
          <Icon name="x" className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="mb-4">
          <h2 id="evaluations-breakdown-title" className="text-[14px] font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{monthLabel}</p>
        </div>

        <div className={`rounded-xl p-3 mb-4 ${tone === 'revenue' ? 'sq-tone-success' : 'sq-tone-warning'}`}>
          <div className="text-[10.5px] uppercase tracking-wide font-semibold text-muted-foreground">Total</div>
          <div className="text-[16px] font-bold tabular-nums">{fmtEURFull(totalCents, intlLocale)}</div>
        </div>

        {days.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
            <Icon name="check-circle" className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No {tone === 'revenue' ? 'revenue' : 'expense'} entries this month.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {days.map((day) => {
              const isExpanded = expandedDay === day.iso;
              return (
                <div key={day.iso} className="rounded-lg border border-border surface-premium">
                  <button
                    type="button"
                    onClick={() => onExpand(day.iso)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-muted flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-bold leading-tight text-foreground">{day.label.split('.')[0]}</span>
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none">{day.weekday}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-foreground">{day.items.length} invoice{day.items.length === 1 ? '' : 's'}</div>
                        <div className="text-[10.5px] text-muted-foreground">{day.label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[14px] font-bold tabular-nums ${totalCls}`}>{fmtEUR(day.totalCents, intlLocale)}</span>
                      {isExpanded ? <Icon name="chevron-up" className="w-4 h-4 text-muted-foreground" /> : <Icon name="chevron-down" className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border px-3 py-2 space-y-1.5">
                      {day.items.map((inv) => {
                        const meta = TYPE_META[inv.type] ?? { label: inv.type, icon: Receipt, tone: 'expense' as const };
                        const status = STATUS_META[inv.status] ?? STATUS_META.DRAFT;
                        const partyLabel = inv.vendorName
                          || (inv.customerId ? customerLabel(customerById.get(inv.customerId)) : null);
                        const vehicle = inv.vehicleId ? vehicleById.get(inv.vehicleId) : null;
                        return (
                          <div key={inv.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11.5px] font-semibold text-foreground truncate">
                                  {inv.title || meta.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  #{inv.invoiceNumber ?? inv.id.slice(0, 6)}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {[partyLabel, vehicle?.license].filter(Boolean).join(' · ') || '—'}
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className={`text-[12px] font-bold tabular-nums ${tone === 'revenue' ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-attention)]'}`}>
                                {fmtEUR(inv.totalCents ?? 0, intlLocale)}
                              </span>
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded ${
                                status.tone === 'paid'
                                  ? 'sq-tone-success'
                                  : status.tone === 'overdue'
                                    ? 'sq-tone-critical'
                                    : status.tone === 'unpaid'
                                      ? 'sq-tone-brand'
                                      : 'sq-tone-neutral'
                              }`}>
                                {status.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Suppress unused import warning until we surface a "% expenses up" badge.
void TrendingDown;
