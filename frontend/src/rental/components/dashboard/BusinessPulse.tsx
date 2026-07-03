import { Icon, type IconName } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  DASHBOARD_KPI_HINT_CLASS,
  DASHBOARD_KPI_NUMBER_CLASS,
  DASHBOARD_KPI_TITLE_CLASS,
  dashboardPanelHeaderClass,
  panelShellClass,
} from './dashboardShell';
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

const METRIC_ICONS: Record<BusinessMetricId, IconName> = {
  revenue: 'trending-up',
  profit: 'activity',
  expenses: 'receipt',
  'open-receivables': 'clock',
  'overdue-receivables': 'alert-triangle',
  'paid-invoices': 'check-circle',
  'draft-invoices': 'file-text',
  'failed-payments': 'alert-circle',
};

function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
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

function financeKpiVisualState(metricId: BusinessMetricId, slice: BusinessPulseSlice | undefined) {
  const count = slice?.count ?? 0;
  const valueCents = slice?.valueCents ?? 0;

  if (metricId === 'revenue') {
    return {
      isSuccess: valueCents > 0,
      isCritical: false,
      isWatch: false,
      isCalmZero: false,
      iconTone: valueCents > 0 ? 'sq-tone-success' : 'bg-muted text-muted-foreground',
      valueTone: valueCents > 0 ? 'text-[color:var(--status-positive)]' : 'text-foreground',
    };
  }

  if (metricId === 'profit') {
    const negative = valueCents < 0;
    const positive = valueCents > 0;
    return {
      isSuccess: positive,
      isCritical: negative,
      isWatch: false,
      isCalmZero: false,
      iconTone: negative ? 'sq-tone-critical' : positive ? 'sq-tone-success' : 'bg-muted text-muted-foreground',
      valueTone: negative
        ? 'text-[color:var(--status-critical)]'
        : positive
          ? 'text-[color:var(--status-positive)]'
          : 'text-foreground',
    };
  }

  if (metricId === 'open-receivables') {
    return {
      isSuccess: false,
      isCritical: false,
      isWatch: count > 0,
      isCalmZero: false,
      iconTone: count > 0 ? 'sq-tone-watch' : 'bg-muted text-muted-foreground',
      valueTone: count > 0 ? 'text-[color:var(--status-watch)]' : 'text-foreground',
    };
  }

  if (metricId === 'overdue-receivables') {
    return {
      isSuccess: count === 0,
      isCritical: count > 0,
      isWatch: false,
      isCalmZero: count === 0,
      iconTone: count > 0 ? 'sq-tone-critical' : 'sq-tone-success',
      valueTone: count > 0 ? 'text-[color:var(--status-critical)]' : 'text-[color:var(--status-positive)]',
    };
  }

  return {
    isSuccess: false,
    isCritical: false,
    isWatch: false,
    isCalmZero: true,
    iconTone: 'bg-muted text-muted-foreground',
    valueTone: 'text-foreground',
  };
}

function financeKpiCardClass(
  metricId: BusinessMetricId,
  slice: BusinessPulseSlice | undefined,
): string {
  const { isSuccess, isCritical, isWatch, isCalmZero } = financeKpiVisualState(metricId, slice);

  return cn(
    'sq-press group relative min-h-[92px] overflow-hidden rounded-2xl border bg-background/40 px-3 py-3 text-left transition-colors duration-200',
    'hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
    isWatch && 'border-[color:var(--status-watch)]/30 bg-card/55',
    (isSuccess || isCalmZero) && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
    !isCritical && !isWatch && !isSuccess && !isCalmZero && 'border-border/45',
  );
}

function FinanceKpiCard({
  metricId,
  slice,
  locale,
  currency,
  title,
  noDataLabel,
  t,
  onSelect,
}: {
  metricId: BusinessMetricId;
  slice: BusinessPulseSlice | undefined;
  locale: string;
  currency: string;
  title: string;
  noDataLabel: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onSelect?: (metricId: BusinessMetricId) => void;
}) {
  const clickable = Boolean(slice && onSelect);
  const value = metricValue(slice, currency, locale, noDataLabel);
  const hint = countHint(slice, t);
  const visual = financeKpiVisualState(metricId, slice);
  const disabled = !slice || slice.valueCents == null;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? () => onSelect?.(metricId) : undefined}
      className={cn(financeKpiCardClass(metricId, slice), !clickable && 'cursor-default')}
      aria-label={`${title}: ${value}${hint ? `, ${hint}` : ''}`}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={DASHBOARD_KPI_TITLE_CLASS}>{title}</p>
          <p
            className={cn(
              'mt-1 truncate',
              DASHBOARD_KPI_NUMBER_CLASS,
              disabled ? 'text-muted-foreground' : visual.valueTone,
            )}
          >
            {value}
          </p>
          {hint ? (
            <p
              className={cn(
                'mt-1 truncate',
                DASHBOARD_KPI_HINT_CLASS,
                metricId === 'overdue-receivables' && (slice?.count ?? 0) > 0
                  ? 'text-[color:var(--status-critical)]/80'
                  : undefined,
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
            visual.iconTone,
          )}
        >
          <Icon name={METRIC_ICONS[metricId]} className="h-3 w-3" />
        </div>
      </div>
      {visual.isCritical && (slice?.count ?? 0) > 0 ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function OptionalMetricChip({
  metricId,
  slice,
  title,
  onSelect,
}: {
  metricId: BusinessMetricId;
  slice: BusinessPulseSlice | undefined;
  title: string;
  onSelect?: (metricId: BusinessMetricId) => void;
}) {
  const count = slice?.count ?? 0;
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(metricId)}
      className="sq-press inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border/40 bg-muted/15 px-2.5 py-1 text-left transition-colors hover:border-border/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
    >
      <span className="truncate text-[10.5px] font-medium text-muted-foreground">{title}</span>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">{count}</span>
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

  const optionalMetricIds = OPTIONAL_BUSINESS_METRICS.filter(
    (id) => (businessPulseSlices[id]?.count ?? 0) > 0,
  );
  const hasOptionalMetrics = optionalMetricIds.length > 0;

  return (
    <section
      className={cn(
        panelShellClass('tertiary', 'flex h-full min-h-0 flex-col border-solid border-border/55 bg-card/55 shadow-none'),
      )}
      aria-label={t('dashboard.financesTitle')}
    >
      <div className={dashboardPanelHeaderClass()}>
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
          {t('dashboard.openInvoices')}
          <Icon name="arrow-right" className="h-3 w-3" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3.5 py-3">
        {loading ? (
          <div className="flex flex-1 items-center" aria-busy>
            <SkeletonMetricGrid
              count={4}
              className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4"
              cardClassName="min-h-[92px] rounded-2xl bg-background/40"
            />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col justify-center py-2">
            <p className="text-[12px] font-medium text-foreground">
              {t('dashboard.financialDataUnavailable')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
              {t('dashboard.invoicesCouldNotLoad')}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PRIMARY_BUSINESS_METRICS.map((metricId) => (
                <FinanceKpiCard
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

            {hasOptionalMetrics ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/30 pt-3">
                {optionalMetricIds.map((metricId) => (
                  <OptionalMetricChip
                    key={metricId}
                    metricId={metricId}
                    slice={businessPulseSlices[metricId]}
                    title={t(METRIC_TITLE_KEYS[metricId])}
                    onSelect={onSelectBusinessMetric}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
