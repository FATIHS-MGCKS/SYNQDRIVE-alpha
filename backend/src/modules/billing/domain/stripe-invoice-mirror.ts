import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { mapStripeInvoiceStatus } from './mappers/stripe-invoice-status.mapper';

export const INVOICE_NUMBER_NOT_FINALIZED_LABEL = 'Noch nicht finalisiert';

export interface InvoiceCustomerSnapshot {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface InvoiceCompanySnapshot {
  companyName: string;
  legalCompanyName: string | null;
  vatId: string | null;
  taxId: string | null;
  taxNumber: string | null;
  invoiceEmail: string | null;
}

export interface InvoiceBillingAddressSnapshot {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface MirroredInvoiceLinePayload {
  stripeInvoiceLineId: string;
  description: string;
  quantity: number;
  unitAmountCents: number | null;
  discountCents: number;
  subtotalCents: number;
  netCents: number | null;
  taxRateBps: number | null;
  taxCents: number | null;
  totalCents: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  productSnapshotJson: Record<string, unknown> | null;
  priceSnapshotJson: Record<string, unknown> | null;
  discountDetailsJson: Record<string, unknown>[] | null;
  taxDetailsJson: Record<string, unknown>[] | null;
}

export interface MirroredInvoicePayload {
  stripeInvoiceId: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  currency: string;
  netAmountCents: number;
  discountAmountCents: number;
  taxAmountCents: number;
  grossAmountCents: number;
  amountDueCents: number;
  amountPaidCents: number;
  amountRemainingCents: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  stripeCreatedAt: Date;
  finalizedAt: Date | null;
  dueDate: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  customerSnapshotJson: InvoiceCustomerSnapshot;
  companySnapshotJson: InvoiceCompanySnapshot;
  billingAddressJson: InvoiceBillingAddressSnapshot | null;
  taxIdSnapshot: string | null;
  lines: MirroredInvoiceLinePayload[];
}

function readId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id ?? null;
}

function unixToDate(value: number | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value * 1000);
}

export function resolveMirroredInvoiceNumber(
  stripeNumber: string | null | undefined,
): string | null {
  const trimmed = stripeNumber?.trim();
  return trimmed || null;
}

export function formatInvoiceNumberForDisplay(
  invoiceNumber: string | null | undefined,
): string {
  return invoiceNumber?.trim() || INVOICE_NUMBER_NOT_FINALIZED_LABEL;
}

export function resolveMirroredPaidAt(input: {
  status: InvoiceStatus;
  stripePaidAt: Date | null;
}): Date | null {
  if (input.status !== InvoiceStatus.PAID) {
    return null;
  }
  return input.stripePaidAt;
}

export function resolveMirroredVoidedAt(input: {
  status: InvoiceStatus;
  stripeVoidedAt: Date | null;
}): Date | null {
  if (input.status !== InvoiceStatus.VOID) {
    return null;
  }
  return input.stripeVoidedAt ?? new Date();
}

function sumAmounts(
  items: Array<{ amount?: number | null }> | null | undefined,
): number {
  return (items ?? []).reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

function extractProductSnapshot(
  line: Stripe.InvoiceLineItem,
): Record<string, unknown> | null {
  const price = line.price;
  if (!price || typeof price === 'string') {
    return null;
  }

  const product = price.product;
  if (!product || typeof product === 'string' || 'deleted' in product) {
    return {
      priceId: price.id,
      nickname: price.nickname ?? null,
      metadata: price.metadata ?? {},
    };
  }

  return {
    productId: product.id,
    name: product.name ?? null,
    description: product.description ?? null,
    metadata: product.metadata ?? {},
  };
}

function extractPriceSnapshot(
  line: Stripe.InvoiceLineItem,
): Record<string, unknown> | null {
  const price = line.price;
  if (!price || typeof price === 'string') {
    return null;
  }

  return {
    priceId: price.id,
    unitAmount: price.unit_amount ?? null,
    currency: price.currency ?? null,
    type: price.type ?? null,
    recurring: price.recurring
      ? {
          interval: price.recurring.interval,
          intervalCount: price.recurring.interval_count,
        }
      : null,
    metadata: price.metadata ?? {},
  };
}

function mapStripeLine(
  line: Stripe.InvoiceLineItem,
  fallbackPeriod: { start: Date | null; end: Date | null },
): MirroredInvoiceLinePayload | null {
  if (!line.id) {
    return null;
  }

  const discountCents = sumAmounts(line.discount_amounts);
  const taxCents = sumAmounts(line.tax_amounts) || null;
  const subtotalCents = line.amount ?? 0;
  const taxRate = line.tax_rates?.[0];
  const taxRateBps =
    taxRate && typeof taxRate.effective_percentage === 'number'
      ? Math.round(taxRate.effective_percentage * 100)
      : null;

  return {
    stripeInvoiceLineId: line.id,
    description: line.description || line.plan?.nickname || 'Subscription',
    quantity: line.quantity ?? 1,
    unitAmountCents: line.price && typeof line.price !== 'string' ? line.price.unit_amount : null,
    discountCents,
    subtotalCents,
    netCents: subtotalCents - discountCents,
    taxRateBps,
    taxCents,
    totalCents: subtotalCents,
    periodStart: unixToDate(line.period?.start) ?? fallbackPeriod.start,
    periodEnd: unixToDate(line.period?.end) ?? fallbackPeriod.end,
    productSnapshotJson: extractProductSnapshot(line),
    priceSnapshotJson: extractPriceSnapshot(line),
    discountDetailsJson: (line.discount_amounts ?? []).map((entry) => ({
      amount: entry.amount ?? 0,
      discount: readId(entry.discount),
    })),
    taxDetailsJson: (line.tax_amounts ?? []).map((entry) => ({
      amount: entry.amount ?? 0,
      taxRate: readId(entry.tax_rate),
      inclusive: entry.inclusive ?? false,
    })),
  };
}

export function buildMirroredInvoicePayload(input: {
  invoice: Stripe.Invoice;
  organization: {
    companyName: string;
    legalCompanyName?: string | null;
    vatId?: string | null;
    taxId?: string | null;
    taxNumber?: string | null;
    invoiceEmail?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  };
}): MirroredInvoicePayload {
  const { invoice } = input;
  const status = mapStripeInvoiceStatus(invoice.status) as InvoiceStatus;
  const periodStart = unixToDate(invoice.period_start);
  const periodEnd = unixToDate(invoice.period_end);
  const stripePaidAt = unixToDate(invoice.status_transitions?.paid_at);
  const stripeVoidedAt = unixToDate(invoice.status_transitions?.voided_at);

  const customerTaxId =
    invoice.customer_tax_ids?.[0] && typeof invoice.customer_tax_ids[0] !== 'string'
      ? invoice.customer_tax_ids[0].value
      : invoice.customer_tax_ids?.[0] && typeof invoice.customer_tax_ids[0] === 'string'
        ? invoice.customer_tax_ids[0]
        : null;

  const lines = (invoice.lines?.data ?? [])
    .map((line) => mapStripeLine(line, { start: periodStart, end: periodEnd }))
    .filter((line): line is MirroredInvoiceLinePayload => Boolean(line));

  return {
    stripeInvoiceId: invoice.id!,
    invoiceNumber: resolveMirroredInvoiceNumber(invoice.number),
    status,
    currency: (invoice.currency || 'eur').toLowerCase(),
    netAmountCents: invoice.subtotal ?? 0,
    discountAmountCents:
      invoice.total_discount_amounts?.reduce((sum, entry) => sum + (entry.amount ?? 0), 0) ?? 0,
    taxAmountCents: invoice.tax ?? 0,
    grossAmountCents: invoice.total ?? invoice.amount_due ?? 0,
    amountDueCents: invoice.amount_due ?? 0,
    amountPaidCents: invoice.amount_paid ?? 0,
    amountRemainingCents: invoice.amount_remaining ?? 0,
    periodStart,
    periodEnd,
    stripeCreatedAt: unixToDate(invoice.created) ?? new Date(),
    finalizedAt: unixToDate(invoice.status_transitions?.finalized_at),
    dueDate: unixToDate(invoice.due_date),
    paidAt: resolveMirroredPaidAt({ status, stripePaidAt }),
    voidedAt: resolveMirroredVoidedAt({ status, stripeVoidedAt }),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
    customerSnapshotJson: {
      name: invoice.customer_name ?? null,
      email: invoice.customer_email ?? null,
      phone: invoice.customer_phone ?? null,
    },
    companySnapshotJson: {
      companyName: input.organization.companyName,
      legalCompanyName: input.organization.legalCompanyName ?? null,
      vatId: input.organization.vatId ?? null,
      taxId: input.organization.taxId ?? null,
      taxNumber: input.organization.taxNumber ?? null,
      invoiceEmail: input.organization.invoiceEmail ?? null,
    },
    billingAddressJson: invoice.customer_address
      ? {
          line1: invoice.customer_address.line1 ?? null,
          line2: invoice.customer_address.line2 ?? null,
          city: invoice.customer_address.city ?? null,
          state: invoice.customer_address.state ?? null,
          postalCode: invoice.customer_address.postal_code ?? null,
          country: invoice.customer_address.country ?? null,
        }
      : {
          line1: input.organization.address ?? null,
          line2: null,
          city: input.organization.city ?? null,
          state: input.organization.state ?? null,
          postalCode: input.organization.zip ?? null,
          country: input.organization.country ?? null,
        },
    taxIdSnapshot: customerTaxId ?? input.organization.vatId ?? input.organization.taxId ?? null,
    lines,
  };
}

export function mergeImmutableInvoiceSnapshots<T extends {
  customerSnapshotJson?: unknown;
  companySnapshotJson?: unknown;
  billingAddressJson?: unknown;
  taxIdSnapshot?: string | null;
}>(
  existing: T | null | undefined,
  incoming: {
    customerSnapshotJson: InvoiceCustomerSnapshot;
    companySnapshotJson: InvoiceCompanySnapshot;
    billingAddressJson: InvoiceBillingAddressSnapshot | null;
    taxIdSnapshot: string | null;
  },
): {
  customerSnapshotJson: InvoiceCustomerSnapshot;
  companySnapshotJson: InvoiceCompanySnapshot;
  billingAddressJson: InvoiceBillingAddressSnapshot | null;
  taxIdSnapshot: string | null;
} {
  return {
    customerSnapshotJson:
      (existing?.customerSnapshotJson as InvoiceCustomerSnapshot | undefined) ??
      incoming.customerSnapshotJson,
    companySnapshotJson:
      (existing?.companySnapshotJson as InvoiceCompanySnapshot | undefined) ??
      incoming.companySnapshotJson,
    billingAddressJson:
      (existing?.billingAddressJson as InvoiceBillingAddressSnapshot | undefined) ??
      incoming.billingAddressJson,
    taxIdSnapshot: existing?.taxIdSnapshot ?? incoming.taxIdSnapshot,
  };
}

export function mergeImmutableLineSnapshots<T extends {
  productSnapshotJson?: unknown;
  priceSnapshotJson?: unknown;
}>(
  existing: T | null | undefined,
  incoming: Pick<MirroredInvoiceLinePayload, 'productSnapshotJson' | 'priceSnapshotJson'>,
): {
  productSnapshotJson: Record<string, unknown> | null;
  priceSnapshotJson: Record<string, unknown> | null;
} {
  return {
    productSnapshotJson:
      (existing?.productSnapshotJson as Record<string, unknown> | undefined) ??
      incoming.productSnapshotJson,
    priceSnapshotJson:
      (existing?.priceSnapshotJson as Record<string, unknown> | undefined) ??
      incoming.priceSnapshotJson,
  };
}
