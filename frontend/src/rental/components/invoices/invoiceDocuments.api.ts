import { api } from '../../../lib/api';
import type { InvoiceDocumentsPanel, SendInvoiceEmailPayload } from './invoiceDocumentTypes';

export async function fetchInvoiceDocumentsPanel(
  orgId: string,
  invoiceId: string,
): Promise<InvoiceDocumentsPanel> {
  return api.invoices.getDocumentsPanel(orgId, invoiceId);
}

export async function generateInvoiceDocument(
  orgId: string,
  invoiceId: string,
  regenerate = false,
): Promise<InvoiceDocumentsPanel> {
  return api.invoices.generateDocument(orgId, invoiceId, regenerate);
}

export async function sendInvoiceDocumentEmail(
  orgId: string,
  invoiceId: string,
  payload: SendInvoiceEmailPayload,
) {
  return api.invoices.sendDocumentEmail(orgId, invoiceId, payload);
}

export async function retryInvoiceDocumentEmail(orgId: string, invoiceId: string, emailId: string) {
  return api.invoices.retryDocumentEmail(orgId, invoiceId, emailId);
}

export function openInvoiceDocument(orgId: string, documentId: string) {
  api.documents.open(orgId, documentId);
}
