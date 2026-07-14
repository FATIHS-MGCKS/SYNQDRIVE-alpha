import { displayInvoiceNumber } from '@modules/invoices/invoice-domain.util';

export type InvoiceEmailTemplateInput = {
  invoiceNumberDisplay?: string | null;
  legacyInvoiceNumber?: number | null;
  invoiceNumber?: number | null;
  sequenceYear?: number | null;
  sequenceNumber?: number | null;
  status?: string;
  title: string;
  totalCents: number;
  currency: string;
  dueDate?: Date | null;
  customerName: string;
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(cents / 100);
}

function formatDueDate(dueDate: Date | null | undefined): string | null {
  if (!dueDate) return null;
  return dueDate.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function buildDefaultInvoiceEmailSubject(input: InvoiceEmailTemplateInput): string {
  const number = displayInvoiceNumber(input);
  if (number) {
    return `Ihre Rechnung ${number}`;
  }
  return `Ihre Rechnung: ${input.title}`;
}

export function buildDefaultInvoiceEmailHtml(input: InvoiceEmailTemplateInput): string {
  const number = displayInvoiceNumber(input);
  const amount = formatMoney(input.totalCents, input.currency);
  const due = formatDueDate(input.dueDate);
  const lines = [
    `<p>Sehr geehrte/r ${input.customerName},</p>`,
    '<p>anbei erhalten Sie Ihre Rechnung.</p>',
    '<ul>',
    number ? `<li><strong>Rechnungsnummer:</strong> ${number}</li>` : '',
    `<li><strong>Betrag:</strong> ${amount}</li>`,
    due ? `<li><strong>Fällig am:</strong> ${due}</li>` : '',
    '</ul>',
    '<p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>',
    '<p>Mit freundlichen Grüßen</p>',
  ].filter(Boolean);
  return lines.join('');
}

export function buildDefaultInvoiceEmailText(input: InvoiceEmailTemplateInput): string {
  const number = displayInvoiceNumber(input);
  const amount = formatMoney(input.totalCents, input.currency);
  const due = formatDueDate(input.dueDate);
  const parts = [
    `Sehr geehrte/r ${input.customerName},`,
    '',
    'anbei erhalten Sie Ihre Rechnung.',
    number ? `Rechnungsnummer: ${number}` : '',
    `Betrag: ${amount}`,
    due ? `Fällig am: ${due}` : '',
    '',
    'Mit freundlichen Grüßen',
  ].filter((line) => line !== '');
  return parts.join('\n');
}
