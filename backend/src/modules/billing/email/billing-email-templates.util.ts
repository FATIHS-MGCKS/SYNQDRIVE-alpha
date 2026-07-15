import { BillingDomainEventType } from '../domain/billing-domain.events';
import {
  BillingEmailLocale,
  getBillingEmailStrings,
} from './billing-email-i18n';
import {
  escapeHtml,
  renderBillingCtaButton,
  renderBillingDetailsTable,
  renderBillingEmailLayout,
  sanitizeUrlForHref,
} from './billing-email-layout.util';

export interface BillingEmailTemplateContext {
  eventType: string;
  locale: BillingEmailLocale;
  organizationName: string;
  planName?: string | null;
  invoiceNumber?: string | null;
  amountFormatted?: string | null;
  currency?: string | null;
  dueDateFormatted?: string | null;
  statusLabel?: string | null;
  nextStep?: string | null;
  billingUrl: string;
  invoiceUrl?: string | null;
  supportEmail: string;
  trialEndFormatted?: string | null;
  effectiveDateFormatted?: string | null;
}

export interface BillingEmailComposition {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  includePdfAttachment: boolean;
}

function resolveCtaLabel(eventType: string, strings: ReturnType<typeof getBillingEmailStrings>): string {
  if (
    eventType === BillingDomainEventType.PAYMENT_METHOD_MISSING
    || eventType === BillingDomainEventType.PAYMENT_FAILED
  ) {
    return strings.ctaPaymentMethod;
  }
  if (
    eventType === BillingDomainEventType.INVOICE_FINALIZED
    || eventType === BillingDomainEventType.INVOICE_OVERDUE
  ) {
    return strings.ctaInvoice;
  }
  return strings.ctaBilling;
}

function resolvePrimaryLink(ctx: BillingEmailTemplateContext): string {
  const invoiceUrl = ctx.invoiceUrl ? sanitizeUrlForHref(ctx.invoiceUrl) : null;
  if (
    invoiceUrl
    && (
      ctx.eventType === BillingDomainEventType.INVOICE_FINALIZED
      || ctx.eventType === BillingDomainEventType.INVOICE_OVERDUE
      || ctx.eventType === BillingDomainEventType.PAYMENT_SUCCEEDED
    )
  ) {
    return invoiceUrl;
  }
  return ctx.billingUrl;
}

export function composeBillingEmail(ctx: BillingEmailTemplateContext): BillingEmailComposition {
  const strings = getBillingEmailStrings(ctx.locale);
  const bodyCopy = strings.bodies[ctx.eventType];
  const subject = strings.subjects[ctx.eventType] ?? 'SynqDrive Abrechnung';
  const intro = bodyCopy?.intro ?? 'Es gibt eine Aktualisierung zu Ihrem SynqDrive-Abonnement.';
  const nextStep = ctx.nextStep?.trim() || bodyCopy?.nextStep || strings.ctaBilling;
  const ctaLabel = resolveCtaLabel(ctx.eventType, strings);
  const primaryLink = resolvePrimaryLink(ctx);

  const detailRows = [
    { label: strings.labelOrganization, value: ctx.organizationName },
    { label: strings.labelPlan, value: ctx.planName },
    { label: strings.labelInvoiceNumber, value: ctx.invoiceNumber },
    { label: strings.labelAmount, value: ctx.amountFormatted },
    { label: strings.labelCurrency, value: ctx.currency },
    { label: strings.labelDueDate, value: ctx.dueDateFormatted },
    { label: strings.labelStatus, value: ctx.statusLabel },
    { label: 'Testende', value: ctx.trialEndFormatted },
    { label: 'Wirksam ab', value: ctx.effectiveDateFormatted },
  ];

  const textDetails = detailRows
    .filter((row) => row.value?.trim())
    .map((row) => `${row.label}: ${row.value}`)
    .join('\n');

  const bodyText = [
    `${strings.greeting},`,
    '',
    intro,
    '',
    textDetails ? `${textDetails}\n` : '',
    `${strings.labelNextStep}: ${nextStep}`,
    '',
    `${ctaLabel}: ${primaryLink}`,
    ctx.invoiceUrl && sanitizeUrlForHref(ctx.invoiceUrl) && ctx.invoiceUrl !== primaryLink
      ? `${strings.ctaInvoice}: ${sanitizeUrlForHref(ctx.invoiceUrl)}`
      : '',
    '',
    strings.noSensitiveData,
    strings.supportHint(ctx.supportEmail),
    '',
    strings.regards,
    'SynqDrive',
  ]
    .filter(Boolean)
    .join('\n');

  const innerHtml = [
    `<p>${escapeHtml(strings.greeting)},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    renderBillingDetailsTable(detailRows),
    `<p><strong>${escapeHtml(strings.labelNextStep)}:</strong> ${escapeHtml(nextStep)}</p>`,
    renderBillingCtaButton(ctaLabel, primaryLink),
    ctx.invoiceUrl && sanitizeUrlForHref(ctx.invoiceUrl) && ctx.invoiceUrl !== primaryLink
      ? `<p style="font-size:14px;"><a href="${escapeHtml(sanitizeUrlForHref(ctx.invoiceUrl)!)}">${escapeHtml(strings.ctaInvoice)}</a></p>`
      : '',
    `<p style="color:#6b7280;font-size:13px;">${escapeHtml(strings.noSensitiveData)}</p>`,
    `<p style="color:#6b7280;font-size:13px;">${escapeHtml(strings.supportHint(ctx.supportEmail))}</p>`,
    `<p>${escapeHtml(strings.regards)}<br/>SynqDrive</p>`,
  ].join('');

  const bodyHtml = renderBillingEmailLayout({
    preheader: intro,
    bodyHtml: innerHtml,
  });

  const includePdfAttachment = ctx.eventType === BillingDomainEventType.INVOICE_FINALIZED;

  return { subject, bodyText, bodyHtml, includePdfAttachment };
}
