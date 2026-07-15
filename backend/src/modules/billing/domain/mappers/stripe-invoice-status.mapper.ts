import { InvoiceStatus } from '@prisma/client';
import { InvoiceStatusDomain } from '../billing-domain.types';
import { mapExternalValue } from '../billing-domain.utils';

const STRIPE_TO_DOMAIN: Readonly<Record<string, InvoiceStatusDomain>> = {
  draft: InvoiceStatusDomain.DRAFT,
  open: InvoiceStatusDomain.OPEN,
  paid: InvoiceStatusDomain.PAID,
  void: InvoiceStatusDomain.VOID,
  uncollectible: InvoiceStatusDomain.UNCOLLECTIBLE,
};

export function mapStripeInvoiceToDomainStatus(
  stripeStatus: string | null | undefined,
): InvoiceStatusDomain {
  return mapExternalValue({
    context: 'stripe.invoice.status',
    value: stripeStatus,
    map: STRIPE_TO_DOMAIN,
    fallback: InvoiceStatusDomain.DRAFT,
  });
}

/** @deprecated Use mapStripeInvoiceToDomainStatus — kept for incremental migration */
export function mapStripeInvoiceStatus(
  stripeStatus: string | null | undefined,
): InvoiceStatus {
  return mapInvoiceDomainToPrisma(
    mapStripeInvoiceToDomainStatus(stripeStatus),
  );
}

export function mapInvoiceDomainToPrisma(status: InvoiceStatusDomain): InvoiceStatus {
  switch (status) {
    case InvoiceStatusDomain.DRAFT:
      return InvoiceStatus.DRAFT;
    case InvoiceStatusDomain.OPEN:
      return InvoiceStatus.OPEN;
    case InvoiceStatusDomain.PAID:
      return InvoiceStatus.PAID;
    case InvoiceStatusDomain.VOID:
      return InvoiceStatus.VOID;
    case InvoiceStatusDomain.UNCOLLECTIBLE:
      return InvoiceStatus.UNCOLLECTIBLE;
    default:
      return InvoiceStatus.DRAFT;
  }
}

export function mapPrismaInvoiceStatusToDomain(
  status: InvoiceStatus,
): InvoiceStatusDomain {
  switch (status) {
    case InvoiceStatus.DRAFT:
      return InvoiceStatusDomain.DRAFT;
    case InvoiceStatus.OPEN:
      return InvoiceStatusDomain.OPEN;
    case InvoiceStatus.PAID:
      return InvoiceStatusDomain.PAID;
    case InvoiceStatus.VOID:
      return InvoiceStatusDomain.VOID;
    case InvoiceStatus.UNCOLLECTIBLE:
      return InvoiceStatusDomain.UNCOLLECTIBLE;
    default:
      return InvoiceStatusDomain.DRAFT;
  }
}
