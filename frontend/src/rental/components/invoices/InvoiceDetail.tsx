import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import { useRentalOrg } from '../../RentalContext';
import { useInvoiceActions } from './hooks/useInvoiceActions';
import { useInvoiceDocuments } from './hooks/useInvoiceDocuments';
import { useInvoicePayments } from './hooks/useInvoicePayments';
import {
  useInvoiceRelationsEnrichment,
  useInvoiceRelationsPermissions,
} from './hooks/useInvoiceRelationsEnrichment';
import { buildInvoiceDetailDto } from './invoiceDetail.mapper';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';
import { InvoiceDetailHeader } from './InvoiceDetailHeader';
import { InvoiceDetailSecondary } from './InvoiceDetailSecondary';
import { InvoiceDocuments } from './InvoiceDocuments';
import { InvoiceLineItems } from './InvoiceLineItems';
import { InvoicePayments } from './InvoicePayments';
import { InvoiceRelations, type InvoiceRelationNavigation } from './InvoiceRelations';
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
  const notesSectionRef = useRef<HTMLDivElement>(null);
  const [expandMoreInfoTrigger, setExpandMoreInfoTrigger] = useState(0);

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

  const paymentsHook = useInvoicePayments(orgId, invoice, onUpdate, detail.actions.record_payment);

  const payments = invoice.payments ?? [];

  const handleCopyInternalId = async () => {
    try {
      await navigator.clipboard.writeText(detail.core.invoiceId);
      toast.success('Interne ID kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  const handleEdit = () => {
    if (!detail.actions.edit.allowed) {
      toast.message(detail.actions.edit.reason ?? 'Bearbeiten nicht verfügbar');
      return;
    }
    setExpandMoreInfoTrigger((n) => n + 1);
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
    <div className="max-w-3xl mx-auto space-y-3 md:space-y-4" data-testid="invoice-detail">
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
        onViewPdf={documents.previewActiveDocument}
        onGeneratePdf={handleGeneratePdf}
        onSendEmail={() => void openSendEmailDialog()}
        onIssue={() => void actions.handleIssue()}
        onRegeneratePdf={() => void documents.generatePdf(true)}
        onMarkSentExternally={() => void actions.handleMarkSent()}
        onRecordPayment={paymentsHook.openRecordDialog}
        onEdit={handleEdit}
        onCancel={() => toast.message(detail.actions.cancel.reason ?? 'Stornierung nicht verfügbar')}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

      <InvoiceRelations
        detail={detail}
        navigation={navigation}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

      <InvoiceLineItems
        invoice={invoice}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

      <InvoicePayments
        invoice={invoice}
        payments={payments}
        recordGate={detail.actions.record_payment}
        recordDialogOpen={paymentsHook.recordDialogOpen}
        onRecordDialogOpenChange={paymentsHook.setRecordDialogOpen}
        amountInput={paymentsHook.amountInput}
        method={paymentsHook.method}
        paidAt={paymentsHook.paidAt}
        reference={paymentsHook.reference}
        note={paymentsHook.note}
        recording={paymentsHook.recording}
        detailPaymentId={paymentsHook.detailPaymentId}
        onDetailPaymentIdChange={paymentsHook.setDetailPaymentId}
        onAmountInputChange={paymentsHook.setAmountInput}
        onMethodChange={paymentsHook.setMethod}
        onPaidAtChange={paymentsHook.setPaidAt}
        onReferenceChange={paymentsHook.setReference}
        onNoteChange={paymentsHook.setNote}
        onOpenRecordDialog={paymentsHook.openRecordDialog}
        onSubmitRecord={() => void paymentsHook.submitRecord()}
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

      <InvoiceDetailSecondary
        invoice={invoice}
        detail={detail}
        orgId={orgId}
        viewportWidth={viewportWidth}
        notesSectionRef={notesSectionRef}
        expandMoreInfoTrigger={expandMoreInfoTrigger}
        onSaveNotes={actions.saveNotes}
        onCopyInternalId={() => void handleCopyInternalId()}
        isDarkMode={isDarkMode}
        card={card}
        tp={tp}
        ts={ts}
        inputCls={inputCls}
      />

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
