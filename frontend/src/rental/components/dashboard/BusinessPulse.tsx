import { Icon, type IconName } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  DASHBOARD_KPI_CURRENCY_CLASS,
  DASHBOARD_KPI_HINT_CLASS,
  DASHBOARD_KPI_NUMBER_CLASS,
  DASHBOARD_KPI_TITLE_CLASS,
  dashboardPanelHeaderClass,
  panelShellClass,
} from './dashboardShell';
import { formatBusinessMoney, formatDashboardMoneyParts } from './dashboardKpiFormat';
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

function metricValueParts(
  slice: BusinessPulseSlice | undefined,
  currency: string,
  locale: string,
): { amount: string; currency: string } | null {
  if (!slice || slice.valueCents == null) return null;
  return formatDashboardMoneyParts(
    slice.valueCents,
    slice.rows[0]?.currency ?? currency,
    locale,
  );
}

function metricValue(
  slice: BusinessPulseSlice | undefined,
  currency: string,
  locale: string,
  noDataLabel: string,
): string {
  if (!slice || slice.valueCents == null) return noDataLabel;
  return formatBusinessMoney(slice.valueCents, slice.rows[0]?.currency ?? currency, locale);
}

/** Finance KPI value — amount matches operational KPI number size; currency suffix smaller. */
function FinanceKpiValue({
  amount,
  currency,
  disabled,
  valueTone,
}: {
  amount: string;
  currency?: string;
  disabled: boolean;
  valueTone: string;
}) {
  const toneClass = disabled ? 'text-muted-foreground' : valueTone;

  if (!currency) {
    return (
      <p className={cn('mt-1', DASHBOARD_KPI_NUMBER_CLASS, toneClass)}>
        {amount}
      </p>
    );
  }

  return (
    <p className={cn('mt-1 flex items-baseline gap-0.5', toneClass)}>
      <span className={DASHBOARD_KPI_NUMBER_CLASS}>{amount}</span>
      <span className={DASHBOARD_KPI_CURRENCY_CLASS}>{currency}</span>
    </p>
  );
}

interface FinanceKpiVisualState {
  isCritical: boolean;
  isWatch: boolean;
  iconTone: string;
  valueTone: string;
}

function financeKpiVisualState(
  metricId: BusinessMetricId,
  slice: BusinessPulseSlice | undefined,
): FinanceKpiVisualState {
  const count = slice?.count ?? 0;
  const valueCents = slice?.valueCents ?? 0;
  const neutralIcon = 'bg-muted text-muted-foreground';

  if (metricId === 'revenue') {
    const positive = valueCents > 0;
    return {
      isCritical: false,
      isWatch: false,
      iconTone: positive ? 'sq-tone-success' : neutralIcon,
      valueTone: positive ? 'text-[color:var(--status-positive)]' : 'text-foreground',
    };
  }

  if (metricId === 'profit') {
    const negative = valueCents < 0;
    const positive = valueCents > 0;
    return {
      isCritical: negative,
      isWatch: false,
      iconTone: negative ? 'sq-tone-critical' : positive ? 'sq-tone-success' : neutralIcon,
      valueTone: negative
        ? 'text-[color:var(--status-critical)]'
        : positive
          ? 'text-[color:var(--status-positive)]'
          : 'text-foreground',
    };
  }

  if (metricId === 'open-receivables') {
    return {
      isCritical: false,
      isWatch: count > 0,
      iconTone: count > 0 ? 'sq-tone-watch' : neutralIcon,
      valueTone: count > 0 ? 'text-[color:var(--status-watch)]' : 'text-foreground',
    };
  }

  if (metricId === 'overdue-receivables') {
    return {
      isCritical: count > 0,
      isWatch: false,
      iconTone: count > 0 ? 'sq-tone-critical' : neutralIcon,
      valueTone: count > 0 ? 'text-[color:var(--status-critical)]' : 'text-foreground',
    };
  }

  return {
    isCritical: false,
    isWatch: false,
    iconTone: neutralIcon,
    valueTone: 'text-foreground',
  };
}

function financeKpiCardClass(metricId: BusinessMetricId, slice: BusinessPulseSlice | undefined): string {
  const { isCritical, isWatch } = financeKpiVisualState(metricId, slice);

  return cn(
    'surface-elevated sq-press group relative min-h-[88px] overflow-hidden rounded-2xl px-3 py-3 text-left transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    isCritical && 'border-[color:var(--status-critical)]/35 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,var(--surface-premium-bg-end)),color-mix(in_srgb,var(--status-critical)_2%,var(--surface-premium-bg-end)))]',
    isWatch && 'border-[color:var(--status-watch)]/30 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-warning)_6%,var(--surface-premium-bg-end)),color-mix(in_srgb,var(--status-warning)_2%,var(--surface-premium-bg-end)))]',
    !isCritical && !isWatch && 'border-[color:var(--surface-premium-border)]',
  );
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
  const valueParts = metricValueParts(slice, currency, locale);
  const displayValue = metricValue(slice, currency, locale, noDataLabel);
  const hint = countHint(slice, t);
  const visual = financeKpiVisualState(metricId, slice);
  const disabled = !slice || slice.valueCents == null;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? () => onSelect?.(metricId) : undefined}
      className={cn(financeKpiCardClass(metricId, slice), !clickable && 'cursor-default')}
      aria-label={`${title}: ${displayValue}${hint ? `, ${hint}` : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={DASHBOARD_KPI_TITLE_CLASS}>{title}</p>
          <FinanceKpiValue
            amount={valueParts?.amount ?? noDataLabel}
            currency={valueParts?.currency}
            disabled={disabled}
            valueTone={visual.valueTone}
          />
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
        panelShellClass(
          'tertiary',
          'flex w-full min-w-0 flex-col',
        ),
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

      <div className="px-3.5 py-3">
        {loading ? (
          <div aria-busy>
            <SkeletonMetricGrid
              count={4}
              className="grid w-full grid-cols-2 gap-3"
              cardClassName="min-h-[88px] rounded-2xl surface-premium"
            />
          </div>
        ) : error ? (
          <div className="py-1">
            <p className="text-[12px] font-medium text-foreground">
              {t('dashboard.financialDataUnavailable')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
              {t('dashboard.invoicesCouldNotLoad')}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
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
