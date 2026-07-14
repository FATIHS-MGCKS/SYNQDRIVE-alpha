import { useState } from 'react';

import { Icon } from '../ui/Icon';
import { useRentalOrg } from '../../RentalContext';
import { useInvoiceActions } from './hooks/useInvoiceActions';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';
import { InvoiceDetailHeader } from './InvoiceDetailHeader';
import { InvoiceDocuments } from './InvoiceDocuments';
import { InvoiceLineItems } from './InvoiceLineItems';
import { InvoiceNotes } from './InvoiceNotes';
import { InvoicePayments } from './InvoicePayments';
import { InvoiceRelations } from './InvoiceRelations';
import { InvoiceTimeline } from './InvoiceTimeline';
import { SendInvoiceDialog } from './SendInvoiceDialog';

interface InvoiceDetailProps extends InvoiceThemeClasses {
  invoice: Invoice;
  orgId: string;
  onBack: () => void;
  onUpdate: (inv: Invoice) => void;
}

export function InvoiceDetail({
  isDarkMode,
  invoice,
  orgId,
  onBack,
  onUpdate,
  card,
  tp,
  ts,
  inputCls,
}: InvoiceDetailProps) {
  const { userRole } = useRentalOrg();
  const canManageEmail = userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN';

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');

  const actions = useInvoiceActions(orgId, invoice, onUpdate);

  const outstanding = invoice.outstandingCents ?? Math.max(0, invoice.totalCents - (invoice.paidCents ?? 0));
  const paidCents = invoice.paidCents ?? 0;
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const payments = invoice.payments ?? [];

  const handleTogglePaymentForm = () => {
    setShowPaymentForm((prev) => {
      const next = !prev;
      if (next) setPaymentAmount((outstanding / 100).toFixed(2));
      return next;
    });
  };

  const handleSubmitPayment = async () => {
    const amountCents = Math.round(parseFloat(paymentAmount || '0') * 100);
    const ok = await actions.handleRecordPayment(amountCents, paymentMethod, paymentReference);
    if (ok) {
      setShowPaymentForm(false);
      setPaymentAmount('');
      setPaymentReference('');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button type="button" onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      <InvoiceDetailHeader
        invoice={invoice}
        paidCents={paidCents}
        outstanding={outstanding}
        issuing={actions.issuing}
        markingSent={actions.markingSent}
        markingPaid={actions.markingPaid}
        refreshing={actions.refreshing}
        showPaymentForm={showPaymentForm}
        paymentAmount={paymentAmount}
        paymentMethod={paymentMethod}
        paymentReference={paymentReference}
        recordingPayment={actions.recordingPayment}
        onIssue={() => void actions.handleIssue()}
        onMarkSent={() => void actions.handleMarkSent()}
        onMarkPaid={() => void actions.handleMarkPaid()}
        onRefresh={() => void actions.refreshInvoice()}
        onTogglePaymentForm={handleTogglePaymentForm}
        onPaymentAmountChange={setPaymentAmount}
        onPaymentMethodChange={setPaymentMethod}
        onPaymentReferenceChange={setPaymentReference}
        onCancelPaymentForm={() => setShowPaymentForm(false)}
        onSubmitPayment={() => void handleSubmitPayment()}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InvoiceTimeline
          invoice={invoice}
          paidCents={paidCents}
          outstanding={outstanding}
          isDarkMode={isDarkMode}
          card={card}
          tp={tp}
          ts={ts}
          inputCls={inputCls}
        />

        <div className="space-y-4">
          <InvoiceRelations
            invoice={invoice}
            isDarkMode={isDarkMode}
            card={card}
            tp={tp}
            ts={ts}
            inputCls={inputCls}
          />

          <InvoiceDocuments
            invoice={invoice}
            canManageEmail={canManageEmail}
            canEmailDocument={actions.canEmailDocument && canManageEmail}
            loadingSendDoc={actions.loadingSendDoc}
            onSendEmail={() => void actions.openInvoiceEmail()}
            isDarkMode={isDarkMode}
            card={card}
            tp={tp}
            ts={ts}
            inputCls={inputCls}
          />
        </div>
      </div>

      <InvoicePayments
        invoice={invoice}
        payments={payments}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

      <InvoiceLineItems
        lineItems={lineItems}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

      {invoice.imageUrl && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Anhang</h3>
          <button
            type="button"
            onClick={() => window.open(invoice.imageUrl!, '_blank')}
            className="text-xs font-medium text-brand"
          >
            Dokument öffnen
          </button>
        </div>
      )}

      <InvoiceNotes
        invoice={invoice}
        onSave={actions.saveNotes}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

      {invoice.description && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-2 uppercase tracking-wider`}>Beschreibung</h3>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-foreground/85' : 'text-gray-700'}`}>
            {invoice.description}
          </p>
        </div>
      )}

      <SendInvoiceDialog
        invoice={invoice}
        orgId={orgId}
        open={actions.sendOpen}
        onOpenChange={actions.setSendOpen}
        sendDoc={actions.sendDoc}
        defaultToEmail={actions.invoiceCustomerEmail}
        onSent={() => void actions.refreshInvoice()}
      />
    </div>
  );
}
