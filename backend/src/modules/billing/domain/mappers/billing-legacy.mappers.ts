import { BillingInterval, BillingTierMode, ProductSlug } from '@prisma/client';
import {
  BillingAddonKey,
  BillingIntervalKind,
  BillingProductKind,
  DiscountKind,
  InvoiceDisplayStatus,
  InvoiceStatusDomain,
  PricingModel,
  StripeMode,
  SyncStatus,
} from '../billing-domain.types';
import { assertNever } from '../billing-domain.utils';

export function mapProductSlugToBillingProductKind(
  slug: ProductSlug | string,
): BillingProductKind {
  switch (slug) {
    case ProductSlug.RENTAL:
    case 'RENTAL':
      return BillingProductKind.RENTAL;
    case ProductSlug.FLEET:
    case 'FLEET':
      return BillingProductKind.FLEET;
    case ProductSlug.TAXI:
    case 'TAXI':
      // Legacy taxi slug maps to rental until dedicated product split.
      return BillingProductKind.RENTAL;
    default:
      if (isBillingAddonKey(slug)) {
        return BillingProductKind.ADDON;
      }
      return BillingProductKind.RENTAL;
  }
}

export function isBillingAddonKey(value: string): value is BillingAddonKey {
  return (Object.values(BillingAddonKey) as string[]).includes(value);
}

export function mapPrismaBillingIntervalToDomain(
  interval: BillingInterval,
): BillingIntervalKind {
  switch (interval) {
    case BillingInterval.MONTHLY:
      return BillingIntervalKind.MONTH;
    default:
      return BillingIntervalKind.MONTH;
  }
}

export function mapBillingIntervalDomainToPrisma(
  interval: BillingIntervalKind,
): BillingInterval {
  switch (interval) {
    case BillingIntervalKind.MONTH:
      return BillingInterval.MONTHLY;
    case BillingIntervalKind.YEAR:
      // Legacy DB enum has only MONTHLY — YEAR prepared for future migration (prompt 10+).
      return BillingInterval.MONTHLY;
    default:
      return BillingInterval.MONTHLY;
  }
}

export function mapPrismaTierModeToPricingModel(mode: BillingTierMode): PricingModel {
  switch (mode) {
    case BillingTierMode.VOLUME:
      return PricingModel.VOLUME;
    case BillingTierMode.GRADUATED:
      return PricingModel.GRADUATED;
    default:
      return PricingModel.VOLUME;
  }
}

export function mapPricingModelToPrismaTierMode(model: PricingModel): BillingTierMode {
  switch (model) {
    case PricingModel.VOLUME:
      return BillingTierMode.VOLUME;
    case PricingModel.GRADUATED:
      return BillingTierMode.GRADUATED;
    case PricingModel.FLAT:
    case PricingModel.USAGE_BASED:
      // Not yet persisted in Prisma — fallback to VOLUME until schema migration.
      return BillingTierMode.VOLUME;
    default:
      return BillingTierMode.VOLUME;
  }
}

export function isDiscountKind(value: string): value is DiscountKind {
  return (Object.values(DiscountKind) as string[]).includes(value);
}

export function mapStripeLivemodeToDomain(livemode: boolean | null | undefined): StripeMode {
  return livemode ? StripeMode.LIVE : StripeMode.TEST;
}

export function mapIntegrationStringToSyncStatus(
  value: string | null | undefined,
): SyncStatus {
  switch (value) {
    case 'SYNCED':
    case SyncStatus.SYNCED:
      return SyncStatus.SYNCED;
    case 'FAILED':
    case SyncStatus.FAILED:
      return SyncStatus.FAILED;
    case 'DRIFTED':
    case SyncStatus.DRIFTED:
      return SyncStatus.DRIFTED;
    case 'PENDING':
    case 'PREPARED':
    case 'NOT_CONNECTED':
    case SyncStatus.PENDING:
      return SyncStatus.PENDING;
    default:
      return SyncStatus.PENDING;
  }
}

/**
 * Maps canonical invoice domain status to API display label.
 * CRITICAL: VOID must never map to Paid.
 */
export function mapInvoiceDomainToDisplayStatus(
  status: InvoiceStatusDomain,
  opts?: { dueDate?: Date | null; now?: Date },
): InvoiceDisplayStatus {
  const now = opts?.now ?? new Date();
  switch (status) {
    case InvoiceStatusDomain.PAID:
      return InvoiceDisplayStatus.PAID;
    case InvoiceStatusDomain.VOID:
      return InvoiceDisplayStatus.VOID;
    case InvoiceStatusDomain.DRAFT:
      return InvoiceDisplayStatus.PENDING;
    case InvoiceStatusDomain.OPEN:
      return opts?.dueDate && opts.dueDate < now
        ? InvoiceDisplayStatus.OVERDUE
        : InvoiceDisplayStatus.PENDING;
    case InvoiceStatusDomain.UNCOLLECTIBLE:
      return InvoiceDisplayStatus.OVERDUE;
    default:
      return assertNever(status, 'mapInvoiceDomainToDisplayStatus');
  }
}

export function mapPrismaInvoiceToDisplayStatus(
  status: string,
  opts?: { dueDate?: Date | null; now?: Date },
): InvoiceDisplayStatus {
  const domain = mapPrismaInvoiceStatusStringToDomain(status);
  return mapInvoiceDomainToDisplayStatus(domain, opts);
}

function mapPrismaInvoiceStatusStringToDomain(status: string): InvoiceStatusDomain {
  switch (status) {
    case InvoiceStatusDomain.DRAFT:
      return InvoiceStatusDomain.DRAFT;
    case InvoiceStatusDomain.OPEN:
      return InvoiceStatusDomain.OPEN;
    case InvoiceStatusDomain.PAID:
      return InvoiceStatusDomain.PAID;
    case InvoiceStatusDomain.VOID:
      return InvoiceStatusDomain.VOID;
    case InvoiceStatusDomain.UNCOLLECTIBLE:
      return InvoiceStatusDomain.UNCOLLECTIBLE;
    default:
      return InvoiceStatusDomain.DRAFT;
  }
}
