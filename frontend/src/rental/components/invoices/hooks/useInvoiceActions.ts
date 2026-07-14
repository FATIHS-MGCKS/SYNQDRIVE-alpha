import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../../lib/api';
import type { GeneratedDocumentDto } from '../../../../lib/api';
import { displayNumber, isOutgoing } from '../invoiceFormatters';
import type { Invoice } from '../invoiceTypes';

export function useInvoiceActions(orgId: string, invoice: Invoice, onUpdate: (inv: Invoice) => void) {
  const [issuing, setIssuing] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendDoc, setSendDoc] = useState<GeneratedDocumentDto | null>(null);
  const [loadingSendDoc, setLoadingSendDoc] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [regeneratingPdf, setRegeneratingPdf] = useState(false);
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState<string | null>(null);

  const refreshInvoice = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await api.invoices.get(orgId, invoice.id);
      onUpdate(fresh);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Rechnung konnte nicht aktualisiert werden');
    } finally {
      setRefreshing(false);
    }
  }, [orgId, invoice.id, onUpdate]);

  const handleIssue = useCallback(async () => {
    setIssuing(true);
    try {
      const updated = await api.invoices.issue(orgId, invoice.id);
      onUpdate(updated);
      toast.success('Rechnung ausgestellt', { description: displayNumber(updated) });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ausstellen fehlgeschlagen');
    } finally {
      setIssuing(false);
    }
  }, [orgId, invoice.id, onUpdate]);

  const handleMarkSent = useCallback(async () => {
    setMarkingSent(true);
    try {
      const updated = await api.invoices.markSent(orgId, invoice.id);
      onUpdate(updated);
      toast.success('Als gesendet markiert');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Status konnte nicht gesetzt werden');
    } finally {
      setMarkingSent(false);
    }
  }, [orgId, invoice.id, onUpdate]);

  const handleMarkPaid = useCallback(async () => {
    setMarkingPaid(true);
    try {
      const updated = await api.invoices.markPaid(orgId, invoice.id);
      onUpdate(updated);
      toast.success('Vollständig bezahlt erfasst');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Zahlung konnte nicht erfasst werden');
    } finally {
      setMarkingPaid(false);
    }
  }, [orgId, invoice.id, onUpdate]);

  const handleRecordPayment = useCallback(
    async (amountCents: number, method: string, reference?: string) => {
      if (!amountCents || amountCents < 1) {
        toast.error('Bitte einen gültigen Betrag eingeben');
        return false;
      }
      setRecordingPayment(true);
      try {
        const updated = await api.invoices.recordPayment(orgId, invoice.id, {
          amountCents,
          method,
          reference: reference || undefined,
        });
        onUpdate(updated);
        toast.success('Zahlung erfasst');
        return true;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Zahlung konnte nicht erfasst werden');
        return false;
      } finally {
        setRecordingPayment(false);
      }
    },
    [orgId, invoice.id, onUpdate],
  );

  const saveNotes = useCallback(
    async (notes: string) => {
      try {
        const updated = await api.invoices.update(orgId, invoice.id, { notes });
        onUpdate(updated);
        toast.success('Notizen gespeichert');
        return true;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Notizen konnten nicht gespeichert werden');
        return false;
      }
    },
    [orgId, invoice.id, onUpdate],
  );

  const openInvoiceEmail = useCallback(async () => {
    if (!invoice.bookingId || !invoice.generatedDocumentId) return;
    setLoadingSendDoc(true);
    try {
      const [meta, customer] = await Promise.all([
        api.documents.metadata(orgId, invoice.generatedDocumentId),
        invoice.customerId
          ? api.customers.get(orgId, invoice.customerId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setSendDoc(meta);
      setInvoiceCustomerEmail(customer?.email ?? null);
      setSendOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Dokument konnte nicht geladen werden');
    } finally {
      setLoadingSendDoc(false);
    }
  }, [orgId, invoice.bookingId, invoice.generatedDocumentId, invoice.customerId]);

  const canEmailDocument =
    Boolean(invoice.bookingId && invoice.generatedDocumentId) &&
    isOutgoing(invoice.type) &&
    invoice.status !== 'DRAFT';

  const handleViewPdf = useCallback(() => {
    if (invoice.generatedDocumentId) {
      api.documents.open(orgId, invoice.generatedDocumentId);
      return;
    }
    if (invoice.imageUrl) {
      window.open(invoice.imageUrl, '_blank', 'noopener,noreferrer');
    }
  }, [orgId, invoice.generatedDocumentId, invoice.imageUrl]);

  const regenerateBookingInvoicePdf = useCallback(async () => {
    if (!invoice.bookingId) return;
    setGeneratingPdf(true);
    try {
      await api.documents.regenerate(orgId, invoice.bookingId, 'BOOKING_INVOICE');
      const fresh = await api.invoices.get(orgId, invoice.id);
      onUpdate(fresh);
      toast.success('PDF erzeugt');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'PDF konnte nicht erzeugt werden');
    } finally {
      setGeneratingPdf(false);
    }
  }, [orgId, invoice.bookingId, invoice.id, onUpdate]);

  const handleRegeneratePdf = useCallback(async () => {
    if (!invoice.bookingId) return;
    setRegeneratingPdf(true);
    try {
      await api.documents.regenerate(orgId, invoice.bookingId, 'BOOKING_INVOICE');
      const fresh = await api.invoices.get(orgId, invoice.id);
      onUpdate(fresh);
      toast.success('PDF neu erzeugt');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'PDF konnte nicht neu erzeugt werden');
    } finally {
      setRegeneratingPdf(false);
    }
  }, [orgId, invoice.bookingId, invoice.id, onUpdate]);

  return {
    issuing,
    markingSent,
    markingPaid,
    recordingPayment,
    refreshing,
    sendOpen,
    setSendOpen,
    sendDoc,
    loadingSendDoc,
    generatingPdf,
    regeneratingPdf,
    invoiceCustomerEmail,
    canEmailDocument,
    handleViewPdf,
    regenerateBookingInvoicePdf,
    handleRegeneratePdf,
    refreshInvoice,
    handleIssue,
    handleMarkSent,
    handleMarkPaid,
    handleRecordPayment,
    saveNotes,
    openInvoiceEmail,
  };
}
