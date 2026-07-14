import { useEffect } from 'react';

import { FormDialog } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatAmount } from './invoiceFormatters';
import { outstandingAmountInputValue, paymentMethodOptions } from './invoicePayments.mapper';
import { INVOICE_ACTION_BTN, INVOICE_DISABLED_BTN } from './invoiceTheme';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  outstandingCents: number;
  amountInput: string;
  method: string;
  paidAt: string;
  reference: string;
  note: string;
  recording: boolean;
  onAmountInputChange: (value: string) => void;
  onMethodChange: (value: string) => void;
  onPaidAtChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  currency,
  outstandingCents,
  amountInput,
  method,
  paidAt,
  reference,
  note,
  recording,
  onAmountInputChange,
  onMethodChange,
  onPaidAtChange,
  onReferenceChange,
  onNoteChange,
  onSubmit,
}: RecordPaymentDialogProps) {
  const { t } = useLanguage();
  const methods = paymentMethodOptions(t);
  const inputCls =
    'w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none';

  useEffect(() => {
    if (!open) return;
    if (!amountInput) {
      onAmountInputChange(outstandingAmountInputValue(outstandingCents));
    }
  }, [open, outstandingCents, amountInput, onAmountInputChange]);

  const outstandingHint = t('invoicePayment.dialog.outstandingHint', {
    amount: formatAmount(outstandingCents, currency),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('invoicePayment.dialog.title')}
      description={outstandingHint}
      maxWidthClassName="sm:max-w-md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={recording}
            className="sq-3d-btn sq-3d-btn--neutral px-4 py-2 text-xs font-semibold"
          >
            {t('invoicePayment.dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={recording || !method}
            className={`${recording || !method ? INVOICE_DISABLED_BTN : INVOICE_ACTION_BTN} px-4 py-2`}
          >
            {recording ? `${t('invoicePayment.dialog.submit')}…` : t('invoicePayment.dialog.submit')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold mb-1 text-muted-foreground">
            {t('invoicePayment.dialog.amount')} ({currency})
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => onAmountInputChange(e.target.value)}
            className={inputCls}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-1 text-muted-foreground">
            {t('invoicePayment.dialog.method')} *
          </label>
          <select
            value={method}
            onChange={(e) => onMethodChange(e.target.value)}
            className={inputCls}
            required
          >
            {methods.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-1 text-muted-foreground">
            {t('invoicePayment.dialog.date')}
          </label>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => onPaidAtChange(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-1 text-muted-foreground">
            {t('invoicePayment.dialog.reference')}
          </label>
          <input
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
            className={inputCls}
            placeholder={t('invoicePayment.dialog.reference')}
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-1 text-muted-foreground">
            {t('invoicePayment.dialog.note')}
          </label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            className={`${inputCls} min-h-[72px] resize-y`}
            rows={3}
          />
        </div>
      </div>
    </FormDialog>
  );
}
