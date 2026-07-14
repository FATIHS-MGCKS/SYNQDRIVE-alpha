import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useLanguage } from '../../../i18n/LanguageContext';
import type { InvoiceActionGate } from '../invoiceDetailTypes';
import {
  buildRecordPaymentPayload,
  defaultPaymentDateValue,
  outstandingAmountInputValue,
  parseAmountInputToCents,
  parseRecordPaymentError,
  validateRecordPaymentForm,
} from '../invoicePayments.mapper';
import { recordInvoicePayment } from '../invoicePayments.api';
import type { Invoice } from '../invoiceTypes';

export function useInvoicePayments(
  orgId: string,
  invoice: Invoice,
  onUpdate: (inv: Invoice) => void,
  recordGate: InvoiceActionGate,
) {
  const { t } = useLanguage();
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [paidAt, setPaidAt] = useState(defaultPaymentDateValue);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [recording, setRecording] = useState(false);

  const openRecordDialog = useCallback(() => {
    if (!recordGate.allowed) {
      if (recordGate.reason) toast.message(recordGate.reason);
      return;
    }
    setAmountInput(outstandingAmountInputValue(invoice.outstandingCents));
    setMethod('BANK_TRANSFER');
    setPaidAt(defaultPaymentDateValue());
    setReference('');
    setNote('');
    setRecordDialogOpen(true);
  }, [invoice.outstandingCents, recordGate]);

  const submitRecord = useCallback(async () => {
    const amountCents = parseAmountInputToCents(amountInput);
    const validationError = validateRecordPaymentForm({
      amountCents,
      method,
      outstandingCents: invoice.outstandingCents,
      t,
    });
    if (validationError) {
      toast.error(validationError);
      return false;
    }

    setRecording(true);
    try {
      const payload = buildRecordPaymentPayload({
        amountCents: amountCents!,
        method,
        paidAt,
        reference,
        note,
      });
      const updated = await recordInvoicePayment(orgId, invoice.id, payload);
      onUpdate(updated);
      toast.success(t('invoicePayment.success.recorded'));
      setRecordDialogOpen(false);
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      toast.error(parseRecordPaymentError(message, t, invoice.currency));
      return false;
    } finally {
      setRecording(false);
    }
  }, [amountInput, method, paidAt, reference, note, invoice, orgId, onUpdate, t]);

  return {
    recordDialogOpen,
    setRecordDialogOpen,
    detailPaymentId,
    setDetailPaymentId,
    amountInput,
    setAmountInput,
    method,
    setMethod,
    paidAt,
    setPaidAt,
    reference,
    setReference,
    note,
    setNote,
    recording,
    openRecordDialog,
    submitRecord,
  };
}
