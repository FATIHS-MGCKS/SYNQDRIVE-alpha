import { PAYMENT_METHOD_OPTIONS } from './invoiceConstants';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface RecordPaymentDialogProps extends InvoiceThemeClasses {
  open: boolean;
  paymentAmount: string;
  paymentMethod: string;
  paymentReference: string;
  recordingPayment: boolean;
  onPaymentAmountChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function RecordPaymentDialog({
  open,
  paymentAmount,
  paymentMethod,
  paymentReference,
  recordingPayment,
  onPaymentAmountChange,
  onPaymentMethodChange,
  onPaymentReferenceChange,
  onCancel,
  onSubmit,
  inputCls,
  ts,
  isDarkMode,
}: RecordPaymentDialogProps) {
  if (!open) return null;

  return (
    <div
      className={`mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-3 ${isDarkMode ? 'border-border/50' : 'border-gray-100'}`}
    >
      <div>
        <label className={`block text-[10px] font-semibold mb-1 ${ts}`}>Betrag (EUR)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={paymentAmount}
          onChange={(e) => onPaymentAmountChange(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={`block text-[10px] font-semibold mb-1 ${ts}`}>Methode</label>
        <select
          value={paymentMethod}
          onChange={(e) => onPaymentMethodChange(e.target.value)}
          className={inputCls}
        >
          {PAYMENT_METHOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={`block text-[10px] font-semibold mb-1 ${ts}`}>Referenz</label>
        <input
          value={paymentReference}
          onChange={(e) => onPaymentReferenceChange(e.target.value)}
          className={inputCls}
          placeholder="optional"
        />
      </div>
      <div className="sm:col-span-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="sq-3d-btn sq-3d-btn--neutral px-3 py-2 text-xs font-semibold">
          Abbrechen
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={recordingPayment}
          className="sq-3d-btn sq-3d-btn--primary px-4 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {recordingPayment ? 'Speichern…' : 'Zahlung buchen'}
        </button>
      </div>
    </div>
  );
}
