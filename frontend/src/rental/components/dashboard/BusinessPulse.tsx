import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { panelShellClass } from './dashboardShell';
import type {
  BusinessMetricId,
  BusinessPulseSlice,
} from './runtime';

interface BusinessPulseProps {
  businessPulseSlices: Record<BusinessMetricId, BusinessPulseSlice>;
  onSelectBusinessMetric?: (metricId: BusinessMetricId) => void;
  onOpenBilling?: () => void;
  locale?: string;
  currency?: string;
  loading?: boolean;
  error?: boolean;
}

const PRIMARY_BUSINESS_METRICS: BusinessMetricId[] = [
  'revenue',
  'profit',
  'open-receivables',
  'overdue-receivables',
];

const OPTIONAL_BUSINESS_METRICS: BusinessMetricId[] = [
  'draft-invoices',
  'failed-payments',
  'paid-invoices',
];

const METRIC_TITLE_KEYS: Record<BusinessMetricId, TranslationKey> = {
  revenue: 'dashboard.revenue',
  profit: 'dashboard.result',
  expenses: 'dashboard.expenses',
  'open-receivables': 'dashboard.openReceivables',
  'overdue-receivables': 'dashboard.overdueReceivables',
  'paid-invoices': 'dashboard.paidInvoicesLabel',
  'draft-invoices': 'dashboard.draftInvoicesLabel',
  'failed-payments': 'dashboard.failedPaymentsLabel',
};

function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function toneTextClass(tone: BusinessPulseSlice['tone']): string {
  if (tone === 'critical') return 'text-[color:var(--status-critical)]';
  if (tone === 'watch') return 'text-[color:var(--status-watch)]';
  if (tone === 'success') return 'text-[color:var(--status-positive)]';
  return 'text-foreground';
}

function metricValue(
  slice: BusinessPulseSlice | undefined,
  currency: string,
  locale: string,
  noDataLabel: string,
): string {
  if (!slice) return noDataLabel;
  if (slice.valueCents == null) return noDataLabel;
  return formatMoney(slice.valueCents, slice.rows[0]?.currency ?? currency, locale);
}

function countHint(
  slice: BusinessPulseSlice | undefined,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string | undefined {
  if (!slice) return undefined;

  if (slice.id === 'profit') {
    return t('dashboard.profitHint');
  }

  if (slice.count == null || slice.count <= 0) {
    return undefined;
  }

  switch (slice.id) {
    case 'revenue':
      return t('dashboard.invoicesShort', { count: slice.count });
    case 'open-receivables':
      return t('dashboard.openReceivableCount', { count: slice.count });
    case 'overdue-receivables':
      return t('dashboard.overdueReceivableCount', { count: slice.count });
    case 'draft-invoices':
      return t('dashboard.draftInvoiceCount', { count: slice.count });
    case 'failed-payments':
      return t('dashboard.failedPaymentCount', { count: slice.count });
    case 'paid-invoices':
      return t('dashboard.paidInvoiceCount', { count: slice.count });
    default:
      return slice.hint;
  }
}

function CompactMetric({
  metricId,
  slice,
  locale,
  currency,
  title,
  disabled,
  noDataLabel,
  t,
  onSelect,
}: {
  metricId: BusinessMetricId;
  slice: BusinessPulseSlice | undefined;
  locale: string;
  currency: string;
  title: string;
  disabled?: boolean;
  noDataLabel: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onSelect?: (metricId: BusinessMetricId) => void;
}) {
  const clickable = Boolean(slice && !disabled && onSelect);
  const value = metricValue(slice, currency, locale, noDataLabel);
  const hint = countHint(slice, t);
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? () => onSelect?.(metricId) : undefined}
      className={cn(
        'min-w-0 rounded-lg border border-border/35 bg-card/35 px-2 py-1.5 text-left transition-colors',
        clickable
          ? 'sq-press hover:border-border/70 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]'
          : 'cursor-default',
      )}
    >
      <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
        {title}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate text-[16px] font-semibold tabular-nums leading-none tracking-[-0.02em]',
          !slice || disabled || slice.valueCents == null ? 'text-muted-foreground' : toneTextClass(slice.tone),
        )}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cn(
            'mt-0.5 truncate text-[10px] leading-snug',
            slice?.tone === 'critical' ? 'text-[color:var(--status-critical)]/80' : 'text-muted-foreground',
          )}
        >
          {hint}
        </p>
      ) : null}
    </button>
  );
}

export function BusinessPulse({
  businessPulseSlices,
  onSelectBusinessMetric,
  onOpenBilling,
  locale: localeProp,
  currency = 'EUR',
  loading = false,
  error = false,
}: BusinessPulseProps) {
  const { locale: contextLocale, t } = useLanguage();
  const locale = localeProp ?? contextLocale;
  const noDataLabel = t('dashboard.noFinancialData');

  const visibleMetricIds = [
    ...PRIMARY_BUSINESS_METRICS,
    ...OPTIONAL_BUSINESS_METRICS.filter((id) => (businessPulseSlices[id]?.count ?? 0) > 0),
  ];

  return (
    <section
      className={cn(
        panelShellClass('tertiary', 'h-full border-solid border-border/55 bg-card/55 shadow-none'),
      )}
      aria-label={t('dashboard.financesTitle')}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand)]" aria-hidden />
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            {t('dashboard.financesTitle')}
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[color:var(--brand)] transition-colors hover:bg-[color:var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {t('dashboard.openBilling')}
          <Icon name="arrow-right" className="h-3 w-3" />
        </button>
      </div>

      {loading ? (
        <div className="px-3.5 py-3" aria-busy>
          <SkeletonRows rows={2} />
        </div>
      ) : error ? (
        <div className="px-3.5 py-3">
          <p className="text-[12px] font-medium text-foreground">
            {t('dashboard.financialDataUnavailable')}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
            {t('dashboard.invoicesCouldNotLoad')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-3.5 pb-2.5 pt-2 sm:grid-cols-4">
          {visibleMetricIds.map((metricId) => (
            <CompactMetric
              key={metricId}
              metricId={metricId}
              slice={businessPulseSlices[metricId]}
              locale={locale}
              currency={currency}
              title={t(METRIC_TITLE_KEYS[metricId])}
              noDataLabel={noDataLabel}
              t={t}
              onSelect={onSelectBusinessMetric}
            />
          ))}
        </div>
      )}
    </section>
  );
}
