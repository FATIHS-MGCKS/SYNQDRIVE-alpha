import { Injectable } from '@nestjs/common';
import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingPaymentMethodStatus,
  BillingPaymentStatus,
  BillingStatus,
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
import { AdminInvoiceQueryDto, AuditLogQueryDto } from './dto/billing.dto';
import { BillingService } from './billing.service';

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
          },
        },
        organizationProducts: {
          select: { plan: true, status: true, product: { select: { slug: true, name: true } } },
        },
      },
    });

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
                currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
                currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
              }
            : null,
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
          paymentMethodStatus: paymentMethod?.status ?? 'MISSING',
          lastInvoice: sub?.invoices[0]
            ? {
                id: sub.invoices[0].id,
                amountCents: sub.invoices[0].amountCents,
                status: sub.invoices[0].status,
                invoiceDate: sub.invoices[0].invoiceDate.toISOString(),
              }
            : null,
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
    if (query.from || query.to) {
      where.invoiceDate = {};
      if (query.from) where.invoiceDate.gte = new Date(query.from);
      if (query.to) where.invoiceDate.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { id: { contains: query.search, mode: 'insensitive' } },
        { stripeInvoiceId: { contains: query.search, mode: 'insensitive' } },
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

    const data = rows.map((inv) => ({
      ...this.billingService.formatInvoiceForApi(inv),
      subscription: inv.subscription,
    }));

    return buildPaginatedResult(data, total, query);
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

    const [
      stripeCustomerMappingCount,
      webhookEventCount,
      failedWebhookCount,
      recentEvents,
    ] = await Promise.all([
      this.prisma.billingSubscription.count({
        where: { stripeCustomerId: { not: null } },
      }),
      this.prisma.stripeWebhookEvent.count(),
      this.prisma.stripeWebhookEvent.count({
        where: { status: StripeWebhookEventStatus.FAILED },
      }),
      this.prisma.stripeWebhookEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    let integrationStatus: 'NOT_CONNECTED' | 'PREPARED' | 'CONNECTED' = 'PREPARED';
    if (!stripeSecretConfigured && !stripeWebhookConfigured && webhookEventCount === 0) {
      integrationStatus = 'NOT_CONNECTED';
    } else if (stripeSecretConfigured && stripeWebhookConfigured) {
      integrationStatus = 'CONNECTED';
    }

    return {
      integrationStatus,
      stripeSecretConfigured,
      stripeWebhookConfigured,
      stripeCustomerMappingCount,
      webhookEventCount,
      failedWebhookCount,
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

  async listWebhookEvents(query: AuditLogQueryDto) {
    const { skip, take } = parsePagination(query as PaginationParams);
    const where: any = {};

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
