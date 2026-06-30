import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
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

const BUSINESS_METRIC_ORDER: BusinessMetricId[] = [
  'revenue',
  'profit',
  'expenses',
  'open-receivables',
  'overdue-receivables',
];

const OPTIONAL_BUSINESS_METRICS: BusinessMetricId[] = [
  'paid-invoices',
  'draft-invoices',
  'failed-payments',
];

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

function metricValue(slice: BusinessPulseSlice | undefined, currency: string, locale: string): string {
  if (!slice) return locale === 'de' ? 'Keine Daten' : 'No data';
  if (slice.valueCents == null) return locale === 'de' ? 'Keine Daten' : 'No data';
  return formatMoney(slice.valueCents, slice.rows[0]?.currency ?? currency, locale);
}

function countHint(slice: BusinessPulseSlice | undefined, locale: string): string | undefined {
  if (!slice || slice.count == null) return undefined;
  const base = locale === 'de'
    ? `${slice.count} Einträge`
    : `${slice.count} item${slice.count === 1 ? '' : 's'}`;
  return slice.hint ? `${base} · ${slice.hint}` : base;
}

function CompactMetric({
  slice,
  locale,
  currency,
  disabled,
  onSelect,
}: {
  slice: BusinessPulseSlice | undefined;
  locale: string;
  currency: string;
  disabled?: boolean;
  onSelect?: (metricId: BusinessMetricId) => void;
}) {
  const clickable = Boolean(slice && !disabled && onSelect);
  const value = metricValue(slice, currency, locale);
  const hint = countHint(slice, locale);
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={
        clickable && slice
          ? () => onSelect?.(slice.id)
          : undefined
      }
      className={cn(
        'min-w-0 rounded-lg border border-border/35 bg-card/35 px-2 py-1.5 text-left transition-colors',
        clickable
          ? 'sq-press hover:border-border/70 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]'
          : 'cursor-default',
      )}
    >
      <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
        {slice?.title ?? (locale === 'de' ? 'Keine Daten' : 'No data')}
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
  locale = 'de',
  currency = 'EUR',
  loading = false,
  error = false,
}: BusinessPulseProps) {
  const de = locale === 'de';
  const visibleMetricIds = [
    ...BUSINESS_METRIC_ORDER,
    ...OPTIONAL_BUSINESS_METRICS.filter((id) => (businessPulseSlices[id]?.count ?? 0) > 0),
  ];
  const invoiceCount = businessPulseSlices.revenue?.count ?? 0;

  const subline = [
    de ? 'Business Pulse · Rechnungen' : 'Business Pulse · Invoices',
    invoiceCount > 0
      ? de
        ? `${invoiceCount} Dokumente`
        : `${invoiceCount} document${invoiceCount === 1 ? '' : 's'}`
      : de
        ? 'Slice-basiert'
        : 'Slice based',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      className={cn(
        panelShellClass('tertiary', 'h-full border-solid border-border/55 bg-card/55 shadow-none'),
      )}
      aria-label="Business Pulse"
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand)]" aria-hidden />
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            Business Pulse
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[color:var(--brand)] transition-colors hover:bg-[color:var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {de ? 'Abrechnung öffnen' : 'Open billing'}
          <Icon name="arrow-right" className="h-3 w-3" />
        </button>
      </div>
      <p className="mt-0.5 truncate px-3.5 text-[11px] leading-snug text-muted-foreground">{subline}</p>

      {loading ? (
        <div className="px-3.5 py-3" aria-busy>
          <SkeletonRows rows={2} />
        </div>
      ) : error ? (
        <div className="px-3.5 py-3">
          <p className="text-[12px] font-medium text-foreground">
            {de ? 'Finanzdaten nicht verfügbar' : 'Financial data unavailable'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
            {de ? 'Rechnungen konnten nicht geladen werden.' : 'Invoices could not be loaded.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 px-3.5 pb-2.5 pt-2 sm:grid-cols-5">
            {visibleMetricIds.map((metricId) => (
              <CompactMetric
                key={metricId}
                slice={businessPulseSlices[metricId]}
                locale={locale}
                currency={currency}
                onSelect={onSelectBusinessMetric}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
