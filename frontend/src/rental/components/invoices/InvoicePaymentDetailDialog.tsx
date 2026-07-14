import { FormDialog } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatPaymentAmount,
  formatPaymentRowDate,
  invoicePaymentMethodLabel,
  invoicePaymentRecordedByLabel,
  invoicePaymentStatusLabel,
} from './invoicePayments.mapper';
import type { InvoicePayment } from './invoiceTypes';

interface InvoicePaymentDetailDialogProps {
  open: boolean;
  payment: InvoicePayment | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
}

function paymentStatusTone(kind?: string): StatusTone {
  if (kind === 'provider_confirmed') return 'success';
  return 'neutral';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground break-words">{value}</p>
    </div>
  );
}

export function InvoicePaymentDetailDialog({
  open,
  payment,
  currency,
  onOpenChange,
}: InvoicePaymentDetailDialogProps) {
  const { t } = useLanguage();
  if (!payment) return null;

  const recordedBy = invoicePaymentRecordedByLabel(payment, t);
  const reference = payment.reference?.trim();
  const note = payment.note?.trim();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('invoicePayment.detail.title')}
      maxWidthClassName="sm:max-w-md"
      footer={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="sq-3d-btn sq-3d-btn--neutral px-4 py-2 text-xs font-semibold w-full sm:w-auto"
        >
          {t('invoicePayment.dialog.cancel')}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {formatPaymentAmount(payment.amountCents, currency)}
          </p>
          <StatusChip tone={paymentStatusTone(payment.statusKind)} dot>
            {invoicePaymentStatusLabel(payment, t)}
          </StatusChip>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DetailRow label={t('invoicePayment.col.method')} value={invoicePaymentMethodLabel(payment.method, t)} />
          <DetailRow label={t('invoicePayment.col.date')} value={formatPaymentRowDate(payment.paidAt)} />
          {reference ? (
            <DetailRow label={t('invoicePayment.col.reference')} value={reference} />
          ) : null}
          {recordedBy ? (
            <DetailRow label={t('invoicePayment.col.recordedBy')} value={recordedBy} />
          ) : null}
        </div>

        {note ? (
          <DetailRow label={t('invoicePayment.dialog.note')} value={note} />
        ) : null}
      </div>
    </FormDialog>
  );
}
