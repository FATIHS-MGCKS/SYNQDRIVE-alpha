export interface PaymentEmailTemplateContext {
  organizationName: string;
  customerName: string;
  bookingReference: string;
  amountFormatted: string;
  currency: string;
  paymentDeadline: string | null;
  checkoutUrl: string;
}

export interface PaymentConfirmationTemplateContext {
  organizationName: string;
  customerName: string;
  bookingReference: string;
  amountFormatted: string;
  currency: string;
  paidAtFormatted: string;
}

export function formatMoneyCents(cents: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

export function formatGermanDateTime(value: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function resolveBookingReference(bookingId: string): string {
  return bookingId.slice(0, 8).toUpperCase();
}

export function composeBookingPaymentRequestEmail(ctx: PaymentEmailTemplateContext): {
  subject: string;
  bodyText: string;
  bodyHtml: string;
} {
  const subject = `Zahlungsanforderung – Buchung ${ctx.bookingReference}`;
  const deadlineLine = ctx.paymentDeadline
    ? `Bitte zahlen Sie bis ${ctx.paymentDeadline}.`
    : 'Bitte schließen Sie die Zahlung zeitnah ab.';

  const bodyText = [
    `Guten Tag ${ctx.customerName},`,
    '',
    `${ctx.organizationName} bittet Sie um die Zahlung für Ihre Buchung ${ctx.bookingReference}.`,
    '',
    `Mietbetrag: ${ctx.amountFormatted}`,
    `Währung: ${ctx.currency}`,
    '',
    'Hinweis: Die Kaution ist nicht in diesem Betrag enthalten und wird bei Abholung separat behandelt.',
    deadlineLine,
    '',
    `Sicher bezahlen: ${ctx.checkoutUrl}`,
    '',
    'Diese E-Mail enthält keine sensiblen Zahlungsdaten. Die Zahlung erfolgt ausschließlich über den sicheren Checkout-Link.',
    '',
    `Mit freundlichen Grüßen`,
    ctx.organizationName,
  ].join('\n');

  const bodyHtml = `
<p>Guten Tag ${escapeHtml(ctx.customerName)},</p>
<p><strong>${escapeHtml(ctx.organizationName)}</strong> bittet Sie um die Zahlung für Ihre Buchung <strong>${escapeHtml(ctx.bookingReference)}</strong>.</p>
<table style="margin:16px 0;border-collapse:collapse">
  <tr><td style="padding:4px 12px 4px 0;color:#555">Mietbetrag</td><td><strong>${escapeHtml(ctx.amountFormatted)}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#555">Währung</td><td>${escapeHtml(ctx.currency)}</td></tr>
</table>
<p style="color:#555;font-size:14px">Die Kaution ist nicht in diesem Betrag enthalten und wird bei Abholung separat behandelt.</p>
<p>${escapeHtml(deadlineLine)}</p>
<p style="margin:24px 0">
  <a href="${escapeHtml(ctx.checkoutUrl)}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Jetzt sicher bezahlen</a>
</p>
<p style="color:#777;font-size:13px">Diese E-Mail enthält keine sensiblen Zahlungsdaten. Die Zahlung erfolgt ausschließlich über den sicheren Checkout-Link.</p>
<p>Mit freundlichen Grüßen<br/>${escapeHtml(ctx.organizationName)}</p>
`.trim();

  return { subject, bodyText, bodyHtml };
}

export function composePaymentConfirmationEmail(ctx: PaymentConfirmationTemplateContext): {
  subject: string;
  bodyText: string;
  bodyHtml: string;
} {
  const subject = `Zahlungseingang bestätigt – Buchung ${ctx.bookingReference}`;
  const bodyText = [
    `Guten Tag ${ctx.customerName},`,
    '',
    `wir haben Ihre Zahlung in Höhe von ${ctx.amountFormatted} für Buchung ${ctx.bookingReference} am ${ctx.paidAtFormatted} erhalten.`,
    '',
    `Vielen Dank – ${ctx.organizationName}`,
  ].join('\n');

  const bodyHtml = `
<p>Guten Tag ${escapeHtml(ctx.customerName)},</p>
<p>wir haben Ihre Zahlung in Höhe von <strong>${escapeHtml(ctx.amountFormatted)}</strong> für Buchung <strong>${escapeHtml(ctx.bookingReference)}</strong> am ${escapeHtml(ctx.paidAtFormatted)} erhalten.</p>
<p>Vielen Dank<br/>${escapeHtml(ctx.organizationName)}</p>
`.trim();

  return { subject, bodyText, bodyHtml };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import type { OutboundEmailSourceType, PaymentEmailType } from '@prisma/client';

export function mapPaymentEmailTypeToSourceType(
  emailType: PaymentEmailType,
): OutboundEmailSourceType {
  return emailType as unknown as OutboundEmailSourceType;
}
