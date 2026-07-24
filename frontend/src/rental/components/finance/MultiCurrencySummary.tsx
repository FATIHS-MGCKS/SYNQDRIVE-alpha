import type { MultiCurrencyAnalyticsMeta } from '@synq/fx/fx.contract';
import { MULTI_CURRENCY_DEFINITIONS } from '@synq/fx/multi-currency-definitions';

interface MultiCurrencySummaryProps {
  meta: MultiCurrencyAnalyticsMeta;
  locale?: 'de' | 'en';
  className?: string;
}

export function MultiCurrencySummary({ meta, locale = 'de', className }: MultiCurrencySummaryProps) {
  const dq = meta.dataQuality;
  const hasFxActivity =
    dq.convertedCount > 0 ||
    dq.excludedCount > 0 ||
    dq.missingRateCount > 0 ||
    dq.staleRateCount > 0 ||
    dq.missingCurrencyCount > 0;

  if (!hasFxActivity && meta.completeness === 'COMPLETE') return null;

  const reportingLabel = MULTI_CURRENCY_DEFINITIONS.reportingCurrency.label[locale];
  const lines: string[] = [];

  lines.push(
    locale === 'de'
      ? `${reportingLabel}: ${meta.reportingCurrency} (${meta.reportingCurrencySource})`
      : `${reportingLabel}: ${meta.reportingCurrency} (${meta.reportingCurrencySource})`,
  );

  if (dq.nativeCount > 0) {
    lines.push(
      locale === 'de'
        ? `${dq.nativeCount} Belege bereits in Basiswährung`
        : `${dq.nativeCount} documents already in base currency`,
    );
  }
  if (dq.convertedCount > 0) {
    lines.push(
      locale === 'de'
        ? `${dq.convertedCount} Belege umgerechnet (Kursdatum: Rechnungs-/Zahlungsdatum)`
        : `${dq.convertedCount} documents converted (rate date: invoice/payment date)`,
    );
  }
  if (dq.missingRateCount > 0) {
    lines.push(
      locale === 'de'
        ? `${dq.missingRateCount} Belege ausgeschlossen — kein Wechselkurs`
        : `${dq.missingRateCount} documents excluded — no exchange rate`,
    );
  }
  if (dq.staleRateCount > 0) {
    lines.push(
      locale === 'de'
        ? `${dq.staleRateCount} Belege ausgeschlossen — veralteter Wechselkurs`
        : `${dq.staleRateCount} documents excluded — stale exchange rate`,
    );
  }
  if (dq.missingCurrencyCount > 0) {
    lines.push(
      locale === 'de'
        ? `${dq.missingCurrencyCount} Belege ohne Währung ausgeschlossen`
        : `${dq.missingCurrencyCount} documents without currency excluded`,
    );
  }

  const statusLabel =
    meta.completeness === 'UNAVAILABLE'
      ? locale === 'de'
        ? 'UNAVAILABLE'
        : 'UNAVAILABLE'
      : meta.completeness === 'PARTIAL'
        ? 'PARTIAL'
        : null;

  return (
    <div
      className={`rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground ${className ?? ''}`}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-semibold text-foreground">
          {locale === 'de' ? 'Multi-Currency Auswertung' : 'Multi-currency analytics'}
        </span>
        {statusLabel && (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400">
            {statusLabel}
          </span>
        )}
      </div>
      <ul className="list-disc pl-4 space-y-0.5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-[9px]">
        {MULTI_CURRENCY_DEFINITIONS.forecastCurrency.description[locale]}
      </p>
    </div>
  );
}
