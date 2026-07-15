import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { Invoice } from '../invoiceTypes';
import type { InvoiceDocumentsPanel, SendInvoiceEmailPayload } from '../invoiceDocumentTypes';
import { shouldPollDocumentsPanel } from '../invoiceDocuments.mapper';
import {
  fetchInvoiceDocumentsPanel,
  generateInvoiceDocument,
  openInvoiceAttachment,
  openInvoiceDocument,
  retryInvoiceDocumentEmail,
  sendInvoiceDocumentEmail,
} from '../invoiceDocuments.api';
import { displayNumber } from '../invoiceFormatters';

const POLL_MS = 2000;

export function useInvoiceDocuments(orgId: string, invoice: Invoice, onInvoiceRefresh?: () => void) {
  const [panel, setPanel] = useState<InvoiceDocumentsPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !invoice.id) return null;
    try {
      const next = await fetchInvoiceDocumentsPanel(orgId, invoice.id);
      setPanel(next);
      return next;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Dokumente konnten nicht geladen werden');
      return null;
    }
  }, [orgId, invoice.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void reload().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!shouldPollDocumentsPanel(panel)) return undefined;

    pollRef.current = setInterval(() => {
      void reload();
    }, POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [panel, reload]);

  const previewDocument = useCallback(
    (documentId: string) => {
      openInvoiceDocument(orgId, documentId);
    },
    [orgId],
  );

  const downloadDocument = useCallback(
    (documentId: string) => {
      openInvoiceDocument(orgId, documentId);
    },
    [orgId],
  );

  const previewIncomingAttachment = useCallback(() => {
    if (!invoice.imageUrl) return;
    openInvoiceAttachment(orgId, invoice.id);
  }, [invoice.imageUrl, invoice.id, orgId]);

  const generatePdf = useCallback(
    async (regenerate = false) => {
      setGenerating(true);
      try {
        const next = await generateInvoiceDocument(orgId, invoice.id, regenerate);
        setPanel(next);
        onInvoiceRefresh?.();
        toast.success(regenerate ? 'Neue PDF-Version erzeugt' : 'PDF erzeugt');
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'PDF konnte nicht erzeugt werden');
        await reload();
      } finally {
        setGenerating(false);
      }
    },
    [orgId, invoice.id, onInvoiceRefresh, reload],
  );

  const sendEmail = useCallback(
    async (payload: SendInvoiceEmailPayload) => {
      setSendingEmail(true);
      try {
        await sendInvoiceDocumentEmail(orgId, invoice.id, payload);
        const next = await reload();
        if (next) setPanel(next);
        onInvoiceRefresh?.();
        toast.success('Rechnung per E-Mail gesendet');
        return true;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'E-Mail konnte nicht gesendet werden');
        return false;
      } finally {
        setSendingEmail(false);
      }
    },
    [orgId, invoice.id, onInvoiceRefresh, reload],
  );

  const retryDelivery = useCallback(
    async (emailId: string) => {
      setRetryingEmailId(emailId);
      try {
        await retryInvoiceDocumentEmail(orgId, invoice.id, emailId);
        const next = await reload();
        if (next) setPanel(next);
        toast.success('E-Mail erneut gesendet');
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Wiederholung fehlgeschlagen');
      } finally {
        setRetryingEmailId(null);
      }
    },
    [orgId, invoice.id, reload],
  );

  const defaultEmailSubject = `Ihre Rechnung ${displayNumber(invoice)}`;

  const previewActiveDocument = useCallback(() => {
    if (panel?.activeDocument?.id) {
      previewDocument(panel.activeDocument.id);
      return;
    }
    if (panel?.hasIncomingAttachment) {
      previewIncomingAttachment();
    }
  }, [panel, previewDocument, previewIncomingAttachment]);

  return {
    panel,
    loading,
    generating,
    sendingEmail,
    retryingEmailId,
    reload,
    previewDocument,
    downloadDocument,
    previewIncomingAttachment,
    previewActiveDocument,
    generatePdf,
    sendEmail,
    retryDelivery,
    defaultEmailSubject,
  };
}
