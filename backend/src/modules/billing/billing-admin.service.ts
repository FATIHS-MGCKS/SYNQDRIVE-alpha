import { Injectable } from '@nestjs/common';
import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingPaymentMethodStatus,
  BillingPaymentStatus,
  BillingStatus,
  BillingSubscriptionItemRole,
  BillingUsageCalculationStatus,
  InvoiceStatus,
  StripeWebhookEventStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  PaginationParams,
} from '@shared/utils/pagination';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillingPriceResolutionService } from './billing-price-resolution.service';
import { BillingUsageService } from './billing-usage.service';
import { PricebookService } from './pricebook.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingEntitlementResolver } from './billing-entitlement-resolver.service';
import {
  AdminBillingListQueryDto,
  AdminInvoiceQueryDto,
  AuditLogQueryDto,
} from './dto/billing.dto';
import { BillingService } from './billing.service';
import { resolveStripeModeFromSecretKey } from './migration/billing-legacy-backfill.util';
import {
  resolveAttemptStatusLabel,
  resolveCreditNoteStatusLabel,
  resolveInvoiceNumberLabel,
  resolvePaymentStatusLabel,
  resolveProviderLabel,
  resolveRefundStatusLabel,
} from './tenant-billing.mapper';

@Injectable()
export class BillingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billableVehicles: BillableVehiclesService,
    private readonly priceResolution: BillingPriceResolutionService,
    private readonly usageService: BillingUsageService,
    private readonly pricebook: PricebookService,
    private readonly audit: BillingAuditService,
    private readonly billingService: BillingService,
    private readonly entitlementResolver: BillingEntitlementResolver,
  ) {}

  async getOverview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      subs,
      openInvoices,
      paidThisMonth,
      missingPaymentMethods,
      stripeSyncErrors,
      failedPayments,
      reconciliationDrifts,
      failedEmailDeliveries,
      orgs,
    ] = await Promise.all([
      this.prisma.billingSubscription.findMany({
        include: {
          invoices: {
            take: 1,
            orderBy: { invoiceDate: 'desc' },
            where: { status: InvoiceStatus.PAID },
          },
        },
      }),
      this.prisma.billingInvoice.count({ where: { status: InvoiceStatus.OPEN } }),
      this.prisma.billingInvoice.count({
        where: { status: InvoiceStatus.PAID, paidAt: { gte: monthStart } },
      }),
      this.countOrgsMissingPaymentMethod(),
      this.prisma.stripeWebhookEvent.count({
        where: { status: StripeWebhookEventStatus.FAILED },
      }),
      this.prisma.billingPayment.count({
        where: { status: BillingPaymentStatus.FAILED },
      }),
      this.prisma.billingReconciliationDrift.count({
        where: { resolvedAt: null },
      }),
      this.prisma.billingDomainEventOutboxDelivery.count({
        where: { status: BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER },
      }),
      this.prisma.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);

    let mrrCents = 0;
    let activeSubscriptions = 0;
    let trialingSubscriptions = 0;
    let pastDueSubscriptions = 0;

    for (const sub of subs) {
      if (sub.status === BillingStatus.ACTIVE) activeSubscriptions++;
      if (sub.status === BillingStatus.TRIALING) trialingSubscriptions++;
      if (sub.status === BillingStatus.PAST_DUE) pastDueSubscriptions++;

      const latestPaid = sub.invoices[0];
      if (
        latestPaid &&
        (sub.status === BillingStatus.ACTIVE || sub.status === BillingStatus.TRIALING)
      ) {
        mrrCents += latestPaid.amountCents;
      }
    }

    let billableConnectedVehicles = 0;
    let organizationsWithPriceNotConfigured = 0;

    for (const org of orgs) {
      const vehicles = await this.billableVehicles.getBillableConnectedVehiclesForOrganization(
        org.id,
      );
      billableConnectedVehicles += vehicles.billableVehicleCount;

      const preview = await this.usageService.previewUsage(org.id);
      if (
        !preview.configured ||
        preview.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED ||
        preview.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION
      ) {
        organizationsWithPriceNotConfigured++;
      }
    }

    return {
      mrr: mrrCents / 100,
      arr: (mrrCents * 12) / 100,
      mrrIncomplete: organizationsWithPriceNotConfigured > 0,
      mrrIncompleteReason:
        organizationsWithPriceNotConfigured > 0 ? 'PER_ORG_PRICE_NOT_ASSIGNED' : null,
      activeSubscriptions,
      trialingSubscriptions,
      pastDueSubscriptions,
      openInvoices,
      paidInvoicesThisMonth: paidThisMonth,
      missingPaymentMethods,
      billableConnectedVehicles,
      organizationsWithPriceNotConfigured,
      stripeSyncErrors,
      failedPayments,
      reconciliationDrifts,
      failedEmailDeliveries,
      pricingConfigured: organizationsWithPriceNotConfigured === 0,
    };
  }

  async listOrganizationsBilling() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { companyName: 'asc' },
      select: {
        id: true,
        companyName: true,
        status: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            invoices: { take: 1, orderBy: { invoiceDate: 'desc' } },
            items: {
              where: { itemRole: BillingSubscriptionItemRole.BASE_PLAN },
              orderBy: { validFrom: 'desc' },
              take: 1,
              include: {
                billingProduct: { select: { key: true, name: true } },
                priceVersion: {
                  select: { id: true, versionNumber: true, versionLabel: true, status: true },
                },
                priceBook: { select: { id: true, name: true } },
              },
            },
          },
        },
        organizationProducts: {
          select: { plan: true, status: true, product: { select: { slug: true, name: true } } },
        },
      },
    });

    const openInvoiceRows = await this.prisma.billingInvoice.findMany({
      where: { status: InvoiceStatus.OPEN },
      select: {
        amountCents: true,
        subscription: { select: { organizationId: true } },
      },
    });
    const openAmountByOrg = new Map<string, number>();
    for (const invoice of openInvoiceRows) {
      const organizationId = invoice.subscription.organizationId;
      openAmountByOrg.set(
        organizationId,
        (openAmountByOrg.get(organizationId) ?? 0) + invoice.amountCents,
      );
    }

    const rows = await Promise.all(
      orgs.map(async (org) => {
        const sub = org.subscriptions[0] ?? null;
        const vehicles = await this.billableVehicles.getBillableConnectedVehiclesForOrganization(
          org.id,
        );
        const preview = await this.usageService.previewUsage(org.id);
        const paymentMethod = await this.prisma.billingPaymentMethod.findFirst({
          where: { organizationId: org.id, isDefault: true },
          orderBy: { createdAt: 'desc' },
        });

        const warnings: string[] = [];
        if (!paymentMethod) warnings.push('PAYMENT_METHOD_MISSING');
        if (preview.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED) {
          warnings.push('PRICE_NOT_CONFIGURED');
        }
        if (preview.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION) {
          warnings.push('NO_ACTIVE_PRICE_VERSION');
        }
        if (sub?.status === BillingStatus.PAST_DUE) warnings.push('PAST_DUE');
        if (preview.calculationStatus === BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES) {
          warnings.push('NO_BILLABLE_VEHICLES');
        }

        const entitlements = await this.entitlementResolver.resolve(org.id);
        const baseItem = sub?.items[0] ?? null;
        const stripeCustomerMapped = Boolean(sub?.stripeCustomerId);
        const stripeSubscriptionMapped = Boolean(sub?.stripeSubscriptionId);
        const syncStatus = !sub
          ? 'NONE'
          : stripeCustomerMapped && stripeSubscriptionMapped
            ? 'SYNCED'
            : stripeCustomerMapped || stripeSubscriptionMapped
              ? 'PARTIAL'
              : 'MISSING';

        return {
          organization: {
            id: org.id,
            companyName: org.companyName,
            status: org.status,
          },
          subscription: sub
            ? {
                id: sub.id,
                status: sub.status,
                lockVersion: sub.lockVersion,
                currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
                currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
                trialEndAt: sub.trialEndAt?.toISOString() ?? null,
                startedAt: sub.startedAt?.toISOString() ?? null,
                cancelAt: sub.cancelAt?.toISOString() ?? null,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                billingAnchorDay: sub.billingAnchorDay,
                stripeCustomerId: sub.stripeCustomerId,
                stripeSubscriptionId: sub.stripeSubscriptionId,
              }
            : null,
          contract: baseItem
            ? {
                productKey: baseItem.billingProduct?.key ?? null,
                productName: baseItem.billingProduct?.name ?? null,
                priceBookId: baseItem.priceBookId,
                priceBookName: baseItem.priceBook?.name ?? null,
                priceVersionId: baseItem.priceVersionId,
                priceVersionLabel:
                  baseItem.priceVersion?.versionLabel ??
                  (baseItem.priceVersion
                    ? `v${baseItem.priceVersion.versionNumber}`
                    : null),
                priceVersionStatus: baseItem.priceVersion?.status ?? null,
              }
            : null,
          tariffLabel:
            entitlements.baseProduct === 'RENTAL'
              ? 'Rental'
              : entitlements.baseProduct === 'FLEET'
                ? 'Fleet'
                : baseItem?.billingProduct?.name ?? null,
          products: org.organizationProducts,
          entitlements,
          connectedVehicleCount: vehicles.connectedVehicleCount,
          billableVehicleCount: vehicles.billableVehicleCount,
          currentTier: preview.priceTierId
            ? {
                id: preview.priceTierId,
                unitPriceCents: preview.unitPriceCents,
                currency: preview.currency,
              }
            : null,
          priceStatus: preview.calculationStatus,
          projectedMonthlyAmountCents: preview.totalCents,
          discountCents: preview.discountCents,
          discountSummary:
            preview.discountCents && preview.discountCents > 0
              ? `${preview.discounts.length} Rabatt(e)`
              : null,
          paymentMethodStatus: paymentMethod?.status ?? 'MISSING',
          lastInvoice: sub?.invoices[0]
            ? {
                id: sub.invoices[0].id,
                amountCents: sub.invoices[0].amountCents,
                status: sub.invoices[0].status,
                invoiceDate: sub.invoices[0].invoiceDate.toISOString(),
              }
            : null,
          openAmountCents: openAmountByOrg.get(org.id) ?? 0,
          nextChargeAt: sub?.currentPeriodEnd?.toISOString() ?? null,
          syncStatus,
          nextInvoicePreview: {
            subtotalCents: preview.subtotalCents,
            discountCents: preview.discountCents,
            amountAfterDiscountCents: preview.amountAfterDiscountCents,
            taxCents: preview.taxCents,
            totalCents: preview.totalCents,
            calculationStatus: preview.calculationStatus,
            billableVehicleCount: preview.billableVehicleCount,
            discounts: preview.discounts,
            warnings: preview.warnings,
            legacyFallbacks: preview.legacyFallbacks,
          },
          warnings: [...warnings, ...preview.warnings],
        };
      }),
    );

    return rows;
  }

  async listInvoices(query: AdminInvoiceQueryDto) {
    const { skip, take } = parsePagination(query);
    const where: any = {};

    if (query.organizationId) {
      where.subscription = { organizationId: query.organizationId };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.displayStatus === 'OVERDUE') {
      where.status = InvoiceStatus.OPEN;
      where.dueDate = { lt: new Date() };
    } else if (query.displayStatus === 'PENDING' || query.displayStatus === 'OPEN') {
      where.status = InvoiceStatus.OPEN;
      where.OR = [{ dueDate: null }, { dueDate: { gte: new Date() } }];
    } else if (query.displayStatus === 'DRAFT') {
      where.status = InvoiceStatus.DRAFT;
    } else if (query.displayStatus === 'PAID') {
      where.status = InvoiceStatus.PAID;
    } else if (query.displayStatus === 'VOID') {
      where.status = InvoiceStatus.VOID;
    } else if (query.displayStatus === 'UNCOLLECTIBLE') {
      where.status = InvoiceStatus.UNCOLLECTIBLE;
    } else if (query.displayStatus === 'FAILED') {
      where.payments = { some: { status: BillingPaymentStatus.FAILED } };
    } else if (query.displayStatus === 'REFUNDED') {
      where.payments = { some: { status: BillingPaymentStatus.REFUNDED } };
    } else if (query.displayStatus === 'PARTIALLY_REFUNDED') {
      where.payments = { some: { status: BillingPaymentStatus.PARTIALLY_REFUNDED } };
    }
    if (query.from || query.to) {
      where.invoiceDate = {};
      if (query.from) where.invoiceDate.gte = new Date(query.from);
      if (query.to) where.invoiceDate.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { id: { contains: query.search, mode: 'insensitive' } },
        { stripeInvoiceId: { contains: query.search, mode: 'insensitive' } },
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where,
        skip,
        take,
        orderBy: { invoiceDate: 'desc' },
        include: {
          subscription: {
            select: {
              organizationId: true,
              organization: { select: { companyName: true } },
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              attemptCount: true,
              status: true,
              stripePaymentMethodId: true,
            },
          },
          lines: {
            include: {
              usageSnapshot: {
                select: {
                  id: true,
                  billableVehicleCount: true,
                  unitPriceCents: true,
                  calculationStatus: true,
                  periodStart: true,
                  periodEnd: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.billingInvoice.count({ where }),
    ]);

    const orgIds = [...new Set(rows.map((row) => row.subscription.organizationId))];
    const defaultMethods = orgIds.length
      ? await this.prisma.billingPaymentMethod.findMany({
          where: { organizationId: { in: orgIds }, isDefault: true },
          select: {
            organizationId: true,
            type: true,
            brand: true,
            last4: true,
            status: true,
          },
        })
      : [];
    const methodByOrg = new Map(defaultMethods.map((method) => [method.organizationId, method]));

    const data = rows.map((inv) => {
      const latestPayment = inv.payments[0] ?? null;
      const defaultMethod = methodByOrg.get(inv.subscription.organizationId) ?? null;
      return {
        ...this.billingService.formatInvoiceForApi(inv),
        subscription: inv.subscription,
        paymentSummary: {
          attemptCount: latestPayment?.attemptCount ?? 0,
          paymentStatus: latestPayment?.status ?? null,
          paymentMethodLabel: defaultMethod
            ? `${defaultMethod.brand ?? defaultMethod.type} •••• ${defaultMethod.last4 ?? '—'}`
            : null,
          paymentMethodStatus: defaultMethod?.status ?? null,
        },
      };
    });

    return buildPaginatedResult(data, total, query);
  }

  async getInvoice(invoiceId: string) {
    const inv = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: {
          select: {
            organizationId: true,
            stripeCustomerId: true,
            organization: { select: { companyName: true } },
          },
        },
        lines: {
          include: {
            usageSnapshot: {
              select: {
                id: true,
                billableVehicleCount: true,
                unitPriceCents: true,
                calculationStatus: true,
                periodStart: true,
                periodEnd: true,
              },
            },
          },
        },
      },
    });
    if (!inv) return null;
    return {
      ...this.billingService.formatInvoiceForApi(inv),
      subscription: inv.subscription,
    };
  }

  async listAdminPayments(query: AdminBillingListQueryDto) {
    const { skip, take } = parsePagination(query);
    const where: any = {};
    if (query.organizationId) {
      where.invoice = { subscription: { organizationId: query.organizationId } };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.invoice = {
        ...(where.invoice ?? {}),
        invoiceNumber: { contains: query.search, mode: 'insensitive' },
      };
    }
    const [rows, total] = await Promise.all([
      this.prisma.billingPayment.findMany({
        where,
        skip,
        take,
        orderBy: [{ failedAt: 'desc' }, { succeededAt: 'desc' }],
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              subscription: {
                select: {
                  organization: { select: { companyName: true } },
                },
              },
            },
          },
          attempts: {
            orderBy: { attemptedAt: 'desc' },
            take: 1,
            select: {
              safeErrorMessage: true,
              attemptedAt: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.billingPayment.count({ where }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoice.id,
        organizationName: row.invoice.subscription.organization.companyName,
        invoiceNumberLabel: resolveInvoiceNumberLabel(row.invoice.invoiceNumber),
        amountCents: row.amountCents,
        currency: row.currency.toUpperCase(),
        status: row.status,
        statusLabel: resolvePaymentStatusLabel(row.status),
        providerLabel: resolveProviderLabel(row.provider),
        attemptCount: row.attemptCount,
        succeededAt: row.succeededAt?.toISOString() ?? null,
        failedAt: row.failedAt?.toISOString() ?? null,
        lastAttemptError: row.attempts[0]?.safeErrorMessage ?? null,
        lastAttemptAt: row.attempts[0]?.attemptedAt?.toISOString() ?? null,
      })),
      total,
      query,
    );
  }

  async listAdminPaymentAttempts(query: AdminBillingListQueryDto) {
    const { skip, take } = parsePagination(query);
    const where: any = {
      status: query.status ?? 'FAILED',
    };
    if (query.organizationId) {
      where.payment = {
        invoice: { subscription: { organizationId: query.organizationId } },
      };
    }
    const [rows, total] = await Promise.all([
      this.prisma.billingPaymentAttempt.findMany({
        where,
        skip,
        take,
        orderBy: { attemptedAt: 'desc' },
        include: {
          payment: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  subscription: {
                    select: {
                      organization: { select: { companyName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.billingPaymentAttempt.count({ where }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        paymentId: row.paymentId,
        invoiceId: row.payment.invoice.id,
        organizationName: row.payment.invoice.subscription.organization.companyName,
        invoiceNumberLabel: resolveInvoiceNumberLabel(row.payment.invoice.invoiceNumber),
        attemptNumber: row.attemptNumber,
        amountCents: row.amountCents,
        currency: row.payment.currency.toUpperCase(),
        status: row.status,
        statusLabel: resolveAttemptStatusLabel(row.status),
        safeErrorMessage: row.safeErrorMessage,
        attemptedAt: row.attemptedAt.toISOString(),
        nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
      })),
      total,
      query,
    );
  }

  async listAdminRefunds(query: AdminBillingListQueryDto) {
    const { skip, take } = parsePagination(query);
    const where: any = {};
    if (query.organizationId) {
      where.payment = { invoice: { subscription: { organizationId: query.organizationId } } };
    }
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      this.prisma.billingRefund.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          payment: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  subscription: {
                    select: {
                      organization: { select: { companyName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.billingRefund.count({ where }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        paymentId: row.paymentId,
        invoiceId: row.payment.invoice.id,
        organizationName: row.payment.invoice.subscription.organization.companyName,
        invoiceNumberLabel: resolveInvoiceNumberLabel(row.payment.invoice.invoiceNumber),
        amountCents: row.amountCents,
        currency: row.currency.toUpperCase(),
        status: row.status,
        statusLabel: resolveRefundStatusLabel(row.status),
        isPartial: row.isPartial,
        refundedAt: row.refundedAt?.toISOString() ?? null,
        stripeRefundId: row.stripeRefundId,
      })),
      total,
      query,
    );
  }

  async listAdminCreditNotes(query: AdminBillingListQueryDto) {
    const { skip, take } = parsePagination(query);
    const where: any = {};
    if (query.organizationId) {
      where.invoice = { subscription: { organizationId: query.organizationId } };
    }
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      this.prisma.billingCreditNote.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              subscription: {
                select: {
                  organization: { select: { companyName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.billingCreditNote.count({ where }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoice?.id ?? null,
        organizationName: row.invoice?.subscription.organization.companyName ?? '—',
        invoiceNumberLabel: resolveInvoiceNumberLabel(row.invoice?.invoiceNumber ?? null),
        amountCents: row.amountCents,
        currency: row.currency.toUpperCase(),
        status: row.status,
        statusLabel: resolveCreditNoteStatusLabel(row.status),
        issuedAt: row.issuedAt?.toISOString() ?? null,
        hostedUrl: row.hostedUrl,
        pdfUrl: row.pdfUrl,
      })),
      total,
      query,
    );
  }

  async listOutboxDeliveries(query: AdminBillingListQueryDto) {
    const { skip, take } = parsePagination(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.organizationId) {
      where.outboxEvent = { organizationId: query.organizationId };
    }
    const [rows, total] = await Promise.all([
      this.prisma.billingDomainEventOutboxDelivery.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          outboxEvent: {
            select: {
              id: true,
              eventType: true,
              organizationId: true,
              aggregateType: true,
              aggregateId: true,
              occurredAt: true,
            },
          },
        },
      }),
      this.prisma.billingDomainEventOutboxDelivery.count({ where }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        outboxEventId: row.outboxEventId,
        consumerId: row.consumerId,
        eventType: row.outboxEvent.eventType,
        organizationId: row.outboxEvent.organizationId,
        aggregateType: row.outboxEvent.aggregateType,
        aggregateId: row.outboxEvent.aggregateId,
        status: row.status,
        retryCount: row.retryCount,
        lastError: row.lastError ? String(row.lastError).slice(0, 240) : null,
        nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
        occurredAt: row.outboxEvent.occurredAt.toISOString(),
      })),
      total,
      query,
    );
  }

  async listAuditLog(query: AuditLogQueryDto) {
    const { skip, take } = parsePagination(query as PaginationParams);
    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.entityType) where.entityType = query.entityType;

    const [data, total] = await Promise.all([
      this.prisma.billingAuditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.billingAuditLog.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query as PaginationParams);
  }

  async listPaymentMethodsAdmin() {
    const methods = await this.prisma.billingPaymentMethod.findMany({
      orderBy: [{ organizationId: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
      include: {
        organization: { select: { id: true, companyName: true } },
      },
    });

    const subs = await this.prisma.billingSubscription.findMany({
      select: { organizationId: true, stripeCustomerId: true },
    });
    const stripeByOrg = new Map(subs.map((s) => [s.organizationId, s.stripeCustomerId]));

    return methods.map((pm) => ({
      id: pm.id,
      organizationId: pm.organizationId,
      organizationName: pm.organization.companyName,
      hasPaymentMethod: true,
      type: pm.type,
      brand: pm.brand,
      last4: pm.last4,
      expMonth: pm.expMonth,
      expYear: pm.expYear,
      status: pm.status,
      isDefault: pm.isDefault,
      stripeCustomerId: stripeByOrg.get(pm.organizationId) ?? null,
      warnings:
        pm.status !== BillingPaymentMethodStatus.ACTIVE
          ? ['PAYMENT_METHOD_REQUIRES_ATTENTION']
          : [],
    }));
  }

  async getStripeStatus() {
    const stripeSecretConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
    const runtimeStripeMode = resolveStripeModeFromSecretKey(process.env.STRIPE_SECRET_KEY);

    const [
      stripeCustomerMappingCount,
      webhookEventCount,
      failedWebhookCount,
      lastSuccessfulWebhook,
      lastWebhook,
      recentEvents,
    ] = await Promise.all([
      this.prisma.billingSubscription.count({
        where: { stripeCustomerId: { not: null } },
      }),
      this.prisma.stripeWebhookEvent.count(),
      this.prisma.stripeWebhookEvent.count({
        where: { status: StripeWebhookEventStatus.FAILED },
      }),
      this.prisma.stripeWebhookEvent.findFirst({
        where: { status: StripeWebhookEventStatus.PROCESSED },
        orderBy: { processedAt: 'desc' },
      }),
      this.prisma.stripeWebhookEvent.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stripeWebhookEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    let integrationStatus: 'NOT_CONNECTED' | 'PREPARED' | 'CONNECTED' = 'PREPARED';
    if (!stripeSecretConfigured && !stripeWebhookConfigured && webhookEventCount === 0) {
      integrationStatus = 'NOT_CONNECTED';
    } else if (stripeSecretConfigured && stripeWebhookConfigured && lastWebhook) {
      integrationStatus = 'CONNECTED';
    } else if (stripeSecretConfigured || stripeWebhookConfigured || webhookEventCount > 0) {
      integrationStatus = 'PREPARED';
    }

    return {
      integrationStatus,
      stripeSecretConfigured,
      stripeWebhookConfigured,
      runtimeStripeMode,
      stripeCustomerMappingCount,
      webhookEventCount,
      failedWebhookCount,
      lastSuccessfulWebhookAt: lastSuccessfulWebhook?.processedAt?.toISOString() ?? null,
      lastWebhookAt: lastWebhook?.createdAt.toISOString() ?? null,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        stripeEventId: e.stripeEventId,
        type: e.type,
        status: e.status,
        errorMessage: e.errorMessage,
        processedAt: e.processedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async listWebhookEvents(query: AuditLogQueryDto & { status?: string }) {
    const { skip, take } = parsePagination(query as PaginationParams);
    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.stripeWebhookEvent.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stripeWebhookEvent.count({ where }),
    ]);

    return buildPaginatedResult(
      data.map((e) => ({
        id: e.id,
        stripeEventId: e.stripeEventId,
        type: e.type,
        status: e.status,
        errorMessage: e.errorMessage,
        processedAt: e.processedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      query as PaginationParams,
    );
  }

  private async countOrgsMissingPaymentMethod(): Promise<number> {
    const orgsWithSub = await this.prisma.billingSubscription.findMany({
      where: { status: { in: [BillingStatus.ACTIVE, BillingStatus.TRIALING] } },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });

    let missing = 0;
    for (const { organizationId } of orgsWithSub) {
      const pm = await this.prisma.billingPaymentMethod.findFirst({
        where: {
          organizationId,
          status: BillingPaymentMethodStatus.ACTIVE,
        },
      });
      if (!pm) missing++;
    }
    return missing;
  }
}
