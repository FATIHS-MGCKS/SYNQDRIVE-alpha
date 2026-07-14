import { api } from '../../../lib/api';
import type { Invoice } from './invoiceTypes';
import type { RecordInvoicePaymentPayload } from './invoicePaymentTypes';

export async function recordInvoicePayment(
  orgId: string,
  invoiceId: string,
  payload: RecordInvoicePaymentPayload,
): Promise<Invoice> {
  return api.invoices.recordPayment(orgId, invoiceId, payload);
}
