import { useMemo } from 'react';

import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import type { InvoiceActionGate } from './invoiceDetailTypes';
import {
  buildPaymentSummary,
  formatPaymentAmount,
  formatPaymentRowDate,
  invoicePaymentMethodLabel,
  invoicePaymentRecordedByLabel,
  invoicePaymentStatusLabel,
  sortPaymentsNewestFirst,
} from './invoicePayments.mapper';
import type { Invoice, InvoicePayment } from './invoiceTypes';
import { INVOICE_ACTION_BTN, INVOICE_DISABLED_BTN, type InvoiceThemeClasses } from './invoiceTheme';
import { InvoicePaymentDetailDialog } from './InvoicePaymentDetailDialog';
import { RecordPaymentDialog } from './RecordPaymentDialog';

interface InvoicePaymentsProps extends InvoiceThemeClasses {
  invoice: Invoice;
  payments: InvoicePayment[];
  recordGate: InvoiceActionGate;
  recordDialogOpen: boolean;
  onRecordDialogOpenChange: (open: boolean) => void;
  amountInput: string;
  method: string;
  paidAt: string;
  reference: string;
  note: string;
  recording: boolean;
  detailPaymentId: string | null;
  onDetailPaymentIdChange: (id: string | null) => void;
  onAmountInputChange: (value: string) => void;
  onMethodChange: (value: string) => void;
  onPaidAtChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onOpenRecordDialog: () => void;
  onSubmitRecord: () => void;
}

function paymentStatusTone(kind?: string): StatusTone {
  if (kind === 'provider_confirmed') return 'success';
  return 'neutral';
}

function SummaryCell({
  label,
  value,
  emphasize,
  tp,
}: {
  label: string;
  value: string;
  emphasize?: 'watch' | 'success';
  tp: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm font-semibold tabular-nums tracking-tight ${tp} ${
          emphasize === 'watch'
            ? 'text-[color:var(--status-watch)]'
            : emphasize === 'success'
              ? 'text-[color:var(--status-positive)]'
              : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PaymentMobileCard({
  payment,
  currency,
  onDetails,
  t,
  tp,
  ts,
}: {
  payment: InvoicePayment;
  currency: string;
  onDetails: () => void;
  t: ReturnType<typeof useLanguage>['t'];
  tp: string;
  ts: string;
}) {
  const methodLabel = invoicePaymentMethodLabel(payment.method, t);
  const statusLabel = invoicePaymentStatusLabel(payment, t);
  const recordedBy = invoicePaymentRecordedByLabel(payment, t);
  const reference = payment.reference?.trim();

  return (
    <article className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className={`text-lg font-bold tabular-nums tracking-tight ${tp}`}>
          {formatPaymentAmount(payment.amountCents, currency)}
        </p>
        <StatusChip tone={paymentStatusTone(payment.statusKind)} dot>
          {statusLabel}
        </StatusChip>
      </div>

      <dl className="grid grid-cols-1 gap-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className={ts}>{t('invoicePayment.col.method')}</dt>
          <dd className={`font-medium text-right ${tp}`}>{methodLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className={ts}>{t('invoicePayment.col.date')}</dt>
          <dd className={`font-medium tabular-nums text-right ${tp}`}>{formatPaymentRowDate(payment.paidAt)}</dd>
        </div>
        {reference ? (
          <div className="flex justify-between gap-3">
            <dt className={ts}>{t('invoicePayment.col.reference')}</dt>
            <dd className={`font-medium text-right break-all ${tp}`}>{reference}</dd>
          </div>
        ) : null}
        {recordedBy ? (
          <div className="flex justify-between gap-3">
            <dt className={ts}>{t('invoicePayment.col.recordedBy')}</dt>
            <dd className={`font-medium text-right ${tp}`}>{recordedBy}</dd>
          </div>
        ) : null}
      </dl>

      <button type="button" onClick={onDetails} className={`${INVOICE_ACTION_BTN} w-full justify-center`}>
        <Icon name="eye" className="h-3 w-3" />
        {t('invoicePayment.action.details')}
      </button>
    </article>
  );
}

function PaymentDesktopTable({
  payments,
  currency,
  onDetails,
  t,
  tp,
  ts,
  isDarkMode,
}: {
  payments: InvoicePayment[];
  currency: string;
  onDetails: (id: string) => void;
  t: ReturnType<typeof useLanguage>['t'];
  tp: string;
  ts: string;
  isDarkMode: boolean;
}) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className={isDarkMode ? 'bg-muted/50' : 'bg-gray-50/80'}>
            <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>{t('invoicePayment.col.date')}</th>
            <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>{t('invoicePayment.col.method')}</th>
            <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>{t('invoicePayment.col.amount')}</th>
            <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>{t('invoicePayment.col.reference')}</th>
            <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>{t('invoicePayment.col.status')}</th>
            <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>{t('invoicePayment.col.recordedBy')}</th>
            <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`} aria-label="Aktionen" />
          </tr>
        </thead>
        <tbody className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
          {payments.map((payment) => {
            const recordedBy = invoicePaymentRecordedByLabel(payment, t);
            return (
              <tr key={payment.id}>
                <td className={`px-3 py-2.5 text-xs tabular-nums whitespace-nowrap ${tp}`}>
                  {formatPaymentRowDate(payment.paidAt)}
                </td>
                <td className={`px-3 py-2.5 text-xs ${tp}`}>
                  {invoicePaymentMethodLabel(payment.method, t)}
                </td>
                <td className={`px-3 py-2.5 text-xs text-right font-semibold tabular-nums whitespace-nowrap ${tp}`}>
                  {formatPaymentAmount(payment.amountCents, currency)}
                </td>
                <td className={`px-3 py-2.5 text-xs max-w-[140px] truncate ${ts}`}>
                  {payment.reference?.trim() || '—'}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <StatusChip tone={paymentStatusTone(payment.statusKind)} dot>
                    {invoicePaymentStatusLabel(payment, t)}
                  </StatusChip>
                </td>
                <td className={`px-3 py-2.5 text-xs ${ts}`}>{recordedBy ?? '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onDetails(payment.id)}
                    className="text-[11px] font-semibold text-brand hover:underline"
                  >
                    {t('invoicePayment.action.details')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InvoicePayments({
  invoice,
  payments,
  recordGate,
  recordDialogOpen,
  onRecordDialogOpenChange,
  amountInput,
  method,
  paidAt,
  reference,
  note,
  recording,
  detailPaymentId,
  onDetailPaymentIdChange,
  onAmountInputChange,
  onMethodChange,
  onPaidAtChange,
  onReferenceChange,
  onNoteChange,
  onOpenRecordDialog,
  onSubmitRecord,
  card,
  tp,
  ts,
  isDarkMode,
}: InvoicePaymentsProps) {
  const { t } = useLanguage();
  const summary = useMemo(() => buildPaymentSummary(invoice, t), [invoice, t]);
  const sorted = useMemo(() => sortPaymentsNewestFirst(payments), [payments]);
  const detailPayment = sorted.find((p) => p.id === detailPaymentId) ?? null;
  const canRecord = recordGate.allowed;

  return (
    <div className={`${card} p-4 sm:p-5 space-y-4`} data-testid="invoice-payments-section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>{t('invoicePayment.section.title')}</h3>
          <p className={`text-[11px] ${ts}`}>{t('invoicePayment.sort.newest')}</p>
        </div>
        <button
          type="button"
          disabled={!canRecord}
          title={!canRecord && recordGate.reason ? recordGate.reason : undefined}
          onClick={onOpenRecordDialog}
          className={canRecord ? INVOICE_ACTION_BTN : INVOICE_DISABLED_BTN}
        >
          <Icon name="plus" className="h-3 w-3" />
          {t('invoicePayment.action.record')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <SummaryCell
          label={t('invoicePayment.summary.paid')}
          value={summary.paidFormatted}
          emphasize="success"
          tp={tp}
        />
        <SummaryCell
          label={t('invoicePayment.summary.outstanding')}
          value={summary.outstandingFormatted}
          emphasize={summary.outstandingCents > 0 ? 'watch' : undefined}
          tp={tp}
        />
      </div>

      {sorted.length === 0 ? (
        <p className={`text-xs ${ts}`}>{t('invoicePayment.empty')}</p>
      ) : (
        <>
          <div className="md:hidden space-y-3" data-layout="mobile-cards">
            {sorted.map((payment) => (
              <PaymentMobileCard
                key={payment.id}
                payment={payment}
                currency={summary.currency}
                onDetails={() => onDetailPaymentIdChange(payment.id)}
                t={t}
                tp={tp}
                ts={ts}
              />
            ))}
          </div>

          <PaymentDesktopTable
            payments={sorted}
            currency={summary.currency}
            onDetails={onDetailPaymentIdChange}
            t={t}
            tp={tp}
            ts={ts}
            isDarkMode={isDarkMode}
          />
        </>
      )}

      <RecordPaymentDialog
        open={recordDialogOpen}
        onOpenChange={onRecordDialogOpenChange}
        currency={summary.currency}
        outstandingCents={summary.outstandingCents}
        amountInput={amountInput}
        method={method}
        paidAt={paidAt}
        reference={reference}
        note={note}
        recording={recording}
        onAmountInputChange={onAmountInputChange}
        onMethodChange={onMethodChange}
        onPaidAtChange={onPaidAtChange}
        onReferenceChange={onReferenceChange}
        onNoteChange={onNoteChange}
        onSubmit={() => void onSubmitRecord()}
      />

      <InvoicePaymentDetailDialog
        open={Boolean(detailPayment)}
        payment={detailPayment}
        currency={summary.currency}
        onOpenChange={(open) => {
          if (!open) onDetailPaymentIdChange(null);
        }}
      />
    </div>
  );
}
