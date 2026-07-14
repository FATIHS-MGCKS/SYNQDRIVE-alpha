import { useMemo } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import {
  buildInvoiceLineItemsPanel,
  formatInvoiceMoney,
  formatUnitTimesPrice,
} from './invoiceLineItems.mapper';
import type { InvoiceLineItemView } from './invoiceLineItemTypes';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceLineItemsProps extends InvoiceThemeClasses {
  invoice: Invoice;
}

function SumRow({
  label,
  value,
  emphasize,
  tp,
  ts,
}: {
  label: string;
  value: string;
  emphasize?: 'watch' | 'success' | 'gross';
  tp: string;
  ts: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={`text-xs ${ts}`}>{label}</dt>
      <dd
        className={`text-xs font-semibold tabular-nums text-right ${tp} ${
          emphasize === 'watch'
            ? 'text-[color:var(--status-watch)]'
            : emphasize === 'success'
              ? 'text-[color:var(--status-positive)]'
              : emphasize === 'gross'
                ? 'text-sm font-bold'
                : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function LineMobileCard({
  line,
  currency,
  t,
  tp,
  ts,
}: {
  line: InvoiceLineItemView;
  currency: string;
  t: ReturnType<typeof useLanguage>['t'];
  tp: string;
  ts: string;
}) {
  return (
    <article className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-2" aria-label={line.description}>
      <p className={`text-sm font-semibold break-words ${tp}`}>{line.description}</p>
      <p className={`text-xs ${ts}`}>
        {formatUnitTimesPrice(line.quantity, line.unitPriceNetCents, currency, line.unitLabel, t)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={ts}>{line.taxRateLabel}</span>
        <span className={`font-semibold tabular-nums ${tp}`}>
          {t('invoiceLineItem.mobile.lineTotal')}: {formatInvoiceMoney(line.grossCents, currency)}
        </span>
      </div>
      <p className={`text-[10px] ${ts}`}>
        {t('invoiceLineItem.col.taxAmount')}: {formatInvoiceMoney(line.taxCents, currency)}
        {line.unitLabel ? ` · ${t('invoiceLineItem.col.unit')}: ${line.unitLabel}` : ''}
      </p>
    </article>
  );
}

function LineDesktopTable({
  lines,
  currency,
  t,
  tp,
  ts,
  isDarkMode,
}: {
  lines: InvoiceLineItemView[];
  currency: string;
  t: ReturnType<typeof useLanguage>['t'];
  tp: string;
  ts: string;
  isDarkMode: boolean;
}) {
  return (
    <div className="hidden md:block">
      <table className="w-full table-fixed">
        <caption className="sr-only">{t('invoiceLineItem.section.title')}</caption>
        <thead>
          <tr className={isDarkMode ? 'bg-muted/50' : 'bg-gray-50/80'}>
            <th scope="col" className={`text-left px-3 py-2 text-[11px] font-semibold ${ts} w-[34%]`}>
              {t('invoiceLineItem.col.description')}
            </th>
            <th scope="col" className={`text-right px-3 py-2 text-[11px] font-semibold ${ts} w-[10%]`}>
              {t('invoiceLineItem.col.quantity')}
            </th>
            <th scope="col" className={`text-left px-3 py-2 text-[11px] font-semibold ${ts} w-[10%]`}>
              {t('invoiceLineItem.col.unit')}
            </th>
            <th scope="col" className={`text-right px-3 py-2 text-[11px] font-semibold ${ts} w-[14%]`}>
              {t('invoiceLineItem.col.unitPriceNet')}
            </th>
            <th scope="col" className={`text-right px-3 py-2 text-[11px] font-semibold ${ts} w-[10%]`}>
              {t('invoiceLineItem.col.taxRate')}
            </th>
            <th scope="col" className={`text-right px-3 py-2 text-[11px] font-semibold ${ts} w-[12%]`}>
              {t('invoiceLineItem.col.taxAmount')}
            </th>
            <th scope="col" className={`text-right px-3 py-2 text-[11px] font-semibold ${ts} w-[14%]`}>
              {t('invoiceLineItem.col.lineTotalGross')}
            </th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
          {lines.map((line) => (
            <tr key={line.id}>
              <td className={`px-3 py-2.5 text-xs align-top break-words ${tp}`}>{line.description}</td>
              <td className={`px-3 py-2.5 text-xs text-right tabular-nums align-top ${ts}`}>
                {line.quantity}
              </td>
              <td className={`px-3 py-2.5 text-xs align-top ${ts}`}>{line.unitLabel ?? '—'}</td>
              <td className={`px-3 py-2.5 text-xs text-right tabular-nums align-top ${ts}`}>
                {formatInvoiceMoney(line.unitPriceNetCents, currency)}
              </td>
              <td className={`px-3 py-2.5 text-xs text-right align-top ${ts}`}>{line.taxRateLabel}</td>
              <td className={`px-3 py-2.5 text-xs text-right tabular-nums align-top ${ts}`}>
                {formatInvoiceMoney(line.taxCents, currency)}
              </td>
              <td className={`px-3 py-2.5 text-xs text-right font-semibold tabular-nums align-top ${tp}`}>
                {formatInvoiceMoney(line.grossCents, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceLineItems({ invoice, card, tp, ts, isDarkMode }: InvoiceLineItemsProps) {
  const { t } = useLanguage();
  const panel = useMemo(() => buildInvoiceLineItemsPanel(invoice, t), [invoice, t]);

  if (!panel) return null;

  return (
    <div className={`${card} p-4 sm:p-5 space-y-4`} data-testid="invoice-line-items-section">
      <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>{t('invoiceLineItem.section.title')}</h3>

      <div className="md:hidden space-y-3" data-layout="mobile-line-cards">
        {panel.lines.map((line) => (
          <LineMobileCard key={line.id} line={line} currency={panel.currency} t={t} tp={tp} ts={ts} />
        ))}
      </div>

      <LineDesktopTable
        lines={panel.lines}
        currency={panel.currency}
        t={t}
        tp={tp}
        ts={ts}
        isDarkMode={isDarkMode}
      />

      <div
        className={`rounded-xl border border-border/60 bg-muted/10 p-3 sm:p-4`}
        data-testid="invoice-line-items-summary"
      >
        <dl>
          <SumRow
            label={t('invoiceLineItem.summary.net')}
            value={formatInvoiceMoney(panel.subtotalCents, panel.currency)}
            tp={tp}
            ts={ts}
          />

          {panel.taxBreakdown.length <= 1 ? (
            <SumRow
              label={t('invoiceLineItem.summary.tax')}
              value={formatInvoiceMoney(panel.taxCents, panel.currency)}
              tp={tp}
              ts={ts}
            />
          ) : (
            panel.taxBreakdown.map((row) => (
              <SumRow
                key={row.taxRate}
                label={
                  row.taxRate === 0
                    ? t('invoiceLineItem.tax.free')
                    : t('invoiceLineItem.summary.taxAtRate', { rate: row.taxRate })
                }
                value={formatInvoiceMoney(row.taxCents, panel.currency)}
                tp={tp}
                ts={ts}
              />
            ))
          )}

          <div className={`my-2 border-t ${isDarkMode ? 'border-border/40' : 'border-gray-200'}`} />

          <SumRow
            label={t('invoiceLineItem.summary.gross')}
            value={formatInvoiceMoney(panel.totalCents, panel.currency)}
            emphasize="gross"
            tp={tp}
            ts={ts}
          />

          <SumRow
            label={t('invoiceLineItem.summary.paid')}
            value={formatInvoiceMoney(panel.paidCents, panel.currency)}
            emphasize="success"
            tp={tp}
            ts={ts}
          />

          <SumRow
            label={t('invoiceLineItem.summary.outstanding')}
            value={formatInvoiceMoney(panel.outstandingCents, panel.currency)}
            emphasize={panel.outstandingCents > 0 ? 'watch' : undefined}
            tp={tp}
            ts={ts}
          />

          {panel.hasCredits ? (
            <SumRow
              label={panel.creditLabel ?? t('invoiceLineItem.summary.credit')}
              value={formatInvoiceMoney(panel.creditCents, panel.currency)}
              tp={tp}
              ts={ts}
            />
          ) : null}
        </dl>
      </div>
    </div>
  );
}
