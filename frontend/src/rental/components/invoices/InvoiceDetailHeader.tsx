import { Icon } from '../ui/Icon';
import { SupportContextButton } from '../../../components/support/SupportContextButton';
import { INVOICE_TYPE_MAP } from './invoiceConstants';
import {
  STATUS_MAP,
  canIssue,
  canMarkSent,
  canRecordPayment,
  displayNumber,
  formatAmount,
  isOutgoing,
} from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';
import { INVOICE_ACTION_BTN, INVOICE_DISABLED_BTN, type InvoiceThemeClasses } from './invoiceTheme';
import { RecordPaymentDialog } from './RecordPaymentDialog';

interface InvoiceDetailHeaderProps extends InvoiceThemeClasses {
  invoice: Invoice;
  paidCents: number;
  outstanding: number;
  issuing: boolean;
  markingSent: boolean;
  markingPaid: boolean;
  refreshing: boolean;
  showPaymentForm: boolean;
  paymentAmount: string;
  paymentMethod: string;
  paymentReference: string;
  recordingPayment: boolean;
  onIssue: () => void;
  onMarkSent: () => void;
  onMarkPaid: () => void;
  onRefresh: () => void;
  onTogglePaymentForm: () => void;
  onPaymentAmountChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onCancelPaymentForm: () => void;
  onSubmitPayment: () => void;
}

export function InvoiceDetailHeader({
  invoice,
  paidCents,
  outstanding,
  issuing,
  markingSent,
  markingPaid,
  refreshing,
  showPaymentForm,
  paymentAmount,
  paymentMethod,
  paymentReference,
  recordingPayment,
  onIssue,
  onMarkSent,
  onMarkPaid,
  onRefresh,
  onTogglePaymentForm,
  onPaymentAmountChange,
  onPaymentMethodChange,
  onPaymentReferenceChange,
  onCancelPaymentForm,
  onSubmitPayment,
  card,
  tp,
  ts,
  inputCls,
  isDarkMode,
}: InvoiceDetailHeaderProps) {
  const st = STATUS_MAP[invoice.status] || STATUS_MAP.DRAFT;
  const ty = INVOICE_TYPE_MAP[invoice.type] || INVOICE_TYPE_MAP.OUTGOING_MANUAL;
  const TypeIcon = ty.icon;
  const showIssue = canIssue(invoice.status, invoice.type);
  const showMarkSent = canMarkSent(invoice.status, invoice.type);
  const showPayments = canRecordPayment(invoice.status) && outstanding > 0 && invoice.status !== 'PAID';

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-brand">{displayNumber(invoice)}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${ty.color}`}>
              <TypeIcon className="w-3 h-3" /> {ty.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
            </span>
          </div>
          <h2 className={`text-base font-bold ${tp}`}>{invoice.title}</h2>
          <p className={`text-xs mt-1 ${ts}`}>
            Gesamt {formatAmount(invoice.totalCents, invoice.currency)}
            {paidCents > 0 && (
              <span className="ml-2">
                · Bezahlt {formatAmount(paidCents, invoice.currency)}
                {outstanding > 0 && ` · Offen ${formatAmount(outstanding, invoice.currency)}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <SupportContextButton
            kind="invoice"
            contextData={{
              invoiceId: invoice.id,
              invoiceNumber: displayNumber(invoice),
              amountCents: invoice.totalCents,
              status: invoice.status,
              title: invoice.title,
            }}
          />
          {showIssue && (
            <button
              type="button"
              onClick={onIssue}
              disabled={issuing}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand text-brand-foreground rounded-xl text-xs font-semibold hover:bg-brand-hover disabled:opacity-50"
            >
              {issuing ? (
                <Icon name="loader-2" className="w-3 h-3 animate-spin" />
              ) : (
                <Icon name="file-text" className="w-3 h-3" />
              )}
              Ausstellen
            </button>
          )}
          {isOutgoing(invoice.type) && invoice.status !== 'DRAFT' && (
            showMarkSent ? (
              <button
                type="button"
                onClick={onMarkSent}
                disabled={markingSent}
                className={INVOICE_ACTION_BTN}
                title="Manuell als gesendet markieren (kein E-Mail-Versand)"
              >
                {markingSent ? (
                  <Icon name="loader-2" className="w-3 h-3 animate-spin" />
                ) : (
                  <Icon name="send" className="w-3 h-3" />
                )}
                Als gesendet
              </button>
            ) : invoice.status === 'SENT' ? null : (
              <button type="button" disabled className={INVOICE_DISABLED_BTN} title="Zuerst ausstellen">
                <Icon name="send" className="w-3 h-3" /> Als gesendet
              </button>
            )
          )}
          {showPayments && (
            <>
              <button type="button" onClick={onTogglePaymentForm} className={INVOICE_ACTION_BTN}>
                <Icon name="dollar-sign" className="w-3 h-3" /> Zahlung erfassen
              </button>
              <button
                type="button"
                onClick={onMarkPaid}
                disabled={markingPaid}
                className="sq-3d-btn sq-3d-btn--success flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {markingPaid ? (
                  <Icon name="loader-2" className="w-3 h-3 animate-spin" />
                ) : (
                  <Icon name="check-circle" className="w-3 h-3" />
                )}
                Rest bezahlen
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={INVOICE_ACTION_BTN}
            title="Aktualisieren"
          >
            {refreshing ? (
              <Icon name="loader-2" className="w-3 h-3 animate-spin" />
            ) : (
              <Icon name="refresh-cw" className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      <RecordPaymentDialog
        open={showPaymentForm}
        paymentAmount={paymentAmount}
        paymentMethod={paymentMethod}
        paymentReference={paymentReference}
        recordingPayment={recordingPayment}
        onPaymentAmountChange={onPaymentAmountChange}
        onPaymentMethodChange={onPaymentMethodChange}
        onPaymentReferenceChange={onPaymentReferenceChange}
        onCancel={onCancelPaymentForm}
        onSubmit={onSubmitPayment}
        isDarkMode={isDarkMode}
        tp={tp}
        ts={ts}
        card={card}
        inputCls={inputCls}
      />
    </div>
  );
}
