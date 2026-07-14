import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import { useRentalOrg } from '../../RentalContext';
import { useInvoiceActions } from './hooks/useInvoiceActions';
import { useInvoiceDocuments } from './hooks/useInvoiceDocuments';
import {
  useInvoiceRelationsEnrichment,
  useInvoiceRelationsPermissions,
} from './hooks/useInvoiceRelationsEnrichment';
import { buildInvoiceDetailDto } from './invoiceDetail.mapper';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';
import { InvoiceDetailHeader } from './InvoiceDetailHeader';
import { InvoiceDocuments } from './InvoiceDocuments';
import { InvoiceLineItems } from './InvoiceLineItems';
import { InvoiceNotes } from './InvoiceNotes';
import { InvoicePayments } from './InvoicePayments';
import { InvoiceRelations, type InvoiceRelationNavigation } from './InvoiceRelations';
import { InvoiceTimeline } from './InvoiceTimeline';
import { SendInvoiceDialog } from './SendInvoiceDialog';

interface InvoiceDetailProps extends InvoiceThemeClasses {
  invoice: Invoice;
  orgId: string;
  onBack: () => void;
  onUpdate: (inv: Invoice) => void;
  navigation?: InvoiceRelationNavigation;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 390,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}

export function InvoiceDetail({
  isDarkMode,
  invoice,
  orgId,
  onBack,
  onUpdate,
  navigation,
  card,
  tp,
  ts,
  inputCls,
}: InvoiceDetailProps) {
  const { userRole } = useRentalOrg();
  const canManageEmail = userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN';
  const relationsPermissions = useInvoiceRelationsPermissions();
  const { enrichment } = useInvoiceRelationsEnrichment(orgId, invoice);
  const viewportWidth = useViewportWidth();
  const notesAnchorRef = useRef<HTMLDivElement>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [defaultToEmail, setDefaultToEmail] = useState<string | null>(null);

  const actions = useInvoiceActions(orgId, invoice, onUpdate);

  const refreshInvoice = useCallback(async () => {
    await actions.refreshInvoice();
  }, [actions]);

  const documents = useInvoiceDocuments(orgId, invoice, () => {
    void refreshInvoice();
  });

  const detail = useMemo(
    () =>
      buildInvoiceDetailDto(invoice, {
        canManageEmail,
        relationsEnrichment: enrichment,
        relationsPermissions,
        documentsPanel: documents.panel,
      }),
    [invoice, canManageEmail, enrichment, relationsPermissions, documents.panel],
  );

  const outstanding = detail.amounts.outstandingCents;
  const paidCents = detail.amounts.paidCents;
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const payments = invoice.payments ?? [];

  const openPaymentForm = () => {
    setShowPaymentForm(true);
    setPaymentAmount((outstanding / 100).toFixed(2));
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

  const handleCopyInternalId = async () => {
    try {
      await navigator.clipboard.writeText(detail.core.invoiceId);
      toast.success('Interne ID kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  const handleEdit = () => {
    notesAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast.message('Notizen und Stammdaten weiter unten bearbeiten');
  };

  const openSendEmailDialog = useCallback(async () => {
    if (!detail.primary.sendEmail.allowed) return;
    try {
      const customer = invoice.customerId
        ? await api.customers.get(orgId, invoice.customerId).catch(() => null)
        : null;
      setDefaultToEmail(customer?.email ?? null);
      setSendOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'E-Mail-Dialog konnte nicht geöffnet werden');
    }
  }, [detail.primary.sendEmail.allowed, invoice.customerId, orgId]);

  const handleGeneratePdf = useCallback(() => {
    if (detail.document.hasPdf) {
      void documents.generatePdf(true);
      return;
    }
    void documents.generatePdf(false);
  }, [detail.document.hasPdf, documents]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button type="button" onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${ts}`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück
      </button>

      <InvoiceDetailHeader
        detail={detail}
        viewportWidth={viewportWidth}
        loadingSendDoc={documents.sendingEmail}
        generatingPdf={documents.generating}
        regeneratingPdf={documents.generating}
        markingSent={actions.markingSent}
        showPaymentForm={showPaymentForm}
        paymentAmount={paymentAmount}
        paymentMethod={paymentMethod}
        paymentReference={paymentReference}
        recordingPayment={actions.recordingPayment}
        onViewPdf={documents.previewActiveDocument}
        onGeneratePdf={handleGeneratePdf}
        onSendEmail={() => void openSendEmailDialog()}
        onIssue={() => void actions.handleIssue()}
        onRegeneratePdf={() => void documents.generatePdf(true)}
        onMarkSentExternally={() => void actions.handleMarkSent()}
        onRecordPayment={openPaymentForm}
        onEdit={handleEdit}
        onCancel={() => toast.message(detail.actions.cancel.reason ?? 'Stornierung nicht verfügbar')}
        onCopyInternalId={() => void handleCopyInternalId()}
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
          orgId={orgId}
          invoiceId={invoice.id}
          isDarkMode={isDarkMode}
          card={card}
          tp={tp}
          ts={ts}
          inputCls={inputCls}
        />

        <div className="space-y-4">
          <InvoiceRelations
            detail={detail}
            navigation={navigation}
            tasks={invoice.tasks}
            isDarkMode={isDarkMode}
            card={card}
            tp={tp}
            ts={ts}
            inputCls={inputCls}
          />

          <InvoiceDocuments
            panel={documents.panel}
            loading={documents.loading}
            generating={documents.generating}
            sendingEmail={documents.sendingEmail}
            retryingEmailId={documents.retryingEmailId}
            onPreview={documents.previewDocument}
            onDownload={documents.downloadDocument}
            onPreviewIncoming={documents.previewIncomingAttachment}
            onGenerate={(regenerate) => void documents.generatePdf(regenerate)}
            onSendEmail={() => void openSendEmailDialog()}
            onRetryGeneration={() => void documents.generatePdf(false)}
            onRetryDelivery={(emailId) => void documents.retryDelivery(emailId)}
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

      <div ref={notesAnchorRef}>
        <InvoiceNotes
          invoice={invoice}
          onSave={actions.saveNotes}
          isDarkMode={isDarkMode}
          card={card}
          tp={tp}
          ts={ts}
          inputCls={inputCls}
        />
      </div>

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
        open={sendOpen}
        onOpenChange={setSendOpen}
        defaultToEmail={defaultToEmail}
        defaultSubject={documents.defaultEmailSubject}
        documentId={documents.panel?.activeDocument?.id ?? invoice.generatedDocumentId}
        sending={documents.sendingEmail}
        onSend={documents.sendEmail}
      />
    </div>
  );
}
