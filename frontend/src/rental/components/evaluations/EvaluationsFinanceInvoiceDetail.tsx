import { Receipt, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { EvaluationsInvoiceDataHookResult } from '../../hooks/useEvaluationsInvoiceData';
import { customerLabel } from '../../hooks/useEvaluationsInvoiceData';
import { fmtEurMinor } from '../../lib/evaluations-format';

interface EvaluationsFinanceInvoiceDetailProps {
  invoiceData: EvaluationsInvoiceDataHookResult;
  isDarkMode: boolean;
  intlLocale: string;
  vehicleLabelById: Map<string, { license: string; model: string }>;
}

export function EvaluationsFinanceInvoiceDetail({
  invoiceData,
  isDarkMode,
  intlLocale,
  vehicleLabelById,
}: EvaluationsFinanceInvoiceDetailProps) {
  const { t } = useLanguage();
  const {
    loading,
    invoiceError,
    customerLoadWarning,
    reportingAnchor,
    invoices,
    customerById,
    mtdRevenueCents,
    mtdExpenseCents,
    dailySeries,
    hasDailyData,
    topCustomers,
    topVehicles,
    recentActivity,
  } = invoiceData;

  if (loading) {
    return <p className="text-xs text-muted-foreground">{t('evaluations.ia.loading')}</p>;
  }

  if (invoiceError) {
    return (
      <EmptyState
        compact
        title={t('evaluations.ia.sections.finance.invoiceErrorTitle')}
        description={t('evaluations.ia.sections.finance.invoiceErrorDescription')}
      />
    );
  }

  const monthLabel = reportingAnchor.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
        <span className="font-semibold text-muted-foreground">{monthLabel}</span>
        <span className="rounded-full px-2.5 py-1 font-semibold sq-tone-neutral">
          {t('evaluations.ia.sections.finance.invoiceCount', { count: invoices.length })}
        </span>
      </div>

      {customerLoadWarning ? (
        <p className="rounded-xl px-3 py-2 text-xs font-medium sq-tone-warning" role="status">
          {t('evaluations.ia.sections.finance.customerWarning')}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)] lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
                {t('evaluations.ia.sections.finance.dailyChart')}
              </h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{monthLabel}</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="text-right">
                <div className="text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.ia.kpi.revenueMtd')}
                </div>
                <div className="text-[11px] font-bold text-[color:var(--status-success)]">
                  {fmtEurMinor(mtdRevenueCents, intlLocale)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-medium text-muted-foreground">
                  {t('evaluations.ia.kpi.expensesMtd')}
                </div>
                <div className="text-[11px] font-bold text-[color:var(--status-critical)]">
                  {fmtEurMinor(mtdExpenseCents, intlLocale)}
                </div>
              </div>
            </div>
          </div>
          <div className="relative">
            {!hasDailyData ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <EmptyState
                  compact
                  title={t('evaluations.ia.sections.finance.chartEmptyTitle')}
                  description={t('evaluations.ia.sections.finance.chartEmptyDescription')}
                />
              </div>
            ) : null}
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailySeries} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="evalFinRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="evalFinExpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDarkMode ? 'rgba(55,65,81,0.4)' : 'rgba(229,231,235,0.6)'}
                  vertical={false}
                />
                <XAxis dataKey="day" stroke={isDarkMode ? '#6b7280' : '#9ca3af'} fontSize={10} tickLine={false} axisLine={false} />
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
                    padding: '10px 14px',
                  }}
                  formatter={(value, name) => {
                    const v = typeof value === 'number' ? value : Number(value) || 0;
                    const key = String(name);
                    return [
                      `€${v.toLocaleString(intlLocale)}`,
                      key === 'revenue'
                        ? t('evaluations.ia.sections.finance.chartRevenue')
                        : t('evaluations.ia.sections.finance.chartExpenses'),
                    ];
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#evalFinRevGrad)" dot={false} connectNulls={false} />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={1.5} fill="url(#evalFinExpGrad)" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-foreground">
            <Receipt className="h-3.5 w-3.5" />
            {t('evaluations.ia.sections.finance.recentActivity')}
          </h3>
          {recentActivity.length === 0 ? (
            <EmptyState compact title={t('evaluations.ia.sections.finance.noActivity')} description="" />
          ) : (
            <ul className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {recentActivity.map((inv) => (
                <li key={inv.id} className="rounded-md border border-border/35 px-2 py-1.5 text-[10.5px]">
                  <div className="font-semibold text-foreground truncate">{inv.title ?? inv.type}</div>
                  <div className="text-muted-foreground">
                    {fmtEurMinor(inv.totalCents ?? 0, intlLocale)} · {inv.status}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankList
          title={t('evaluations.ia.sections.finance.topCustomers')}
          empty={t('evaluations.ia.sections.finance.noTopCustomers')}
          rows={topCustomers.map((row, idx) => ({
            key: row.id,
            rank: idx + 1,
            primary: customerLabel(customerById.get(row.id)),
            secondary: t('evaluations.ia.sections.finance.invoiceCount', { count: row.invoiceCount }),
            value: fmtEurMinor(row.revenueCents, intlLocale),
          }))}
        />
        <RankList
          title={t('evaluations.ia.sections.finance.topVehicles')}
          empty={t('evaluations.ia.sections.finance.noTopVehicles')}
          rows={topVehicles.map((row, idx) => {
            const v = vehicleLabelById.get(row.id);
            return {
              key: row.id,
              rank: idx + 1,
              primary: v?.license || row.id.slice(0, 8),
              secondary: v?.model || t('evaluations.ia.sections.finance.invoiceCount', { count: row.invoiceCount }),
              value: fmtEurMinor(row.revenueCents, intlLocale),
            };
          })}
        />
      </div>
    </div>
  );
}

function RankList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ key: string; rank: number; primary: string; secondary: string; value: string }>;
}) {
  return (
    <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-foreground">
        <TrendingUp className="h-3.5 w-3.5 text-[color:var(--status-success)]" />
        {title}
      </h3>
      {rows.length === 0 ? (
        <EmptyState compact title={empty} description="" />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[10.5px] hover:bg-muted/40">
              <div className="min-w-0">
                <span className="mr-2 font-bold text-muted-foreground">{row.rank}.</span>
                <span className="font-semibold text-foreground">{row.primary}</span>
                <span className="ml-1 text-muted-foreground">{row.secondary}</span>
              </div>
              <span className="shrink-0 font-bold text-[color:var(--status-success)]">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
