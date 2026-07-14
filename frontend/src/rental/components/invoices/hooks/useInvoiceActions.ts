import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../../lib/api';
import { displayNumber } from '../invoiceFormatters';
import type { Invoice } from '../invoiceTypes';

export function useInvoiceActions(orgId: string, invoice: Invoice, onUpdate: (inv: Invoice) => void) {
  const [issuing, setIssuing] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshInvoice = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await api.invoices.get(orgId, invoice.id);
      onUpdate(fresh);
      return fresh;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Rechnung konnte nicht aktualisiert werden');
      return null;
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
      } finally {
        // no-op
      }
    },
    [orgId, invoice.id, onUpdate],
  );

  return {
    issuing,
    markingSent,
    markingPaid,
    recordingPayment,
    refreshing,
    refreshInvoice,
    handleIssue,
    handleMarkSent,
    handleMarkPaid,
    handleRecordPayment,
    saveNotes,
  };
}
