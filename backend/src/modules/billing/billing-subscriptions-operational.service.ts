import {
  BillingStatus,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  BillingUsageCalculationStatus,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, parsePagination } from '@shared/utils/pagination';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillingAdminService } from './billing-admin.service';
import { BillingUsageService } from './billing-usage.service';
import { BillingEntitlementResolver } from './billing-entitlement-resolver.service';
import {
  buildBillingAttention,
  deriveBillingHealthFromAttention,
  deriveReconciliationHealth,
  DOMAIN_STATUS_LABELS,
} from './billing-attention.util';
import { resolveSubscriptionDomainStatus } from './domain/subscription-lifecycle';
import { BillingSubscriptionsOperationalQueryDto } from './dto/billing-subscriptions-operational.dto';
import type {
  BillingOverviewOperationalDto,
  BillingReconciliationDriftEnrichedDto,
  BillingSubscriptionOperationalDetailDto,
  BillingSubscriptionOperationalRowDto,
  BillingTrialDto,
} from './billing-subscriptions-operational.types';

const DRIFT_TYPE_LABELS: Record<string, string> = {
  STATUS_MISMATCH: 'Status weicht ab',
  QUANTITY_MISMATCH: 'Menge weicht ab',
  WRONG_PRICE_ID: 'Falsche Stripe-Price-ID',
  MISSING_ITEM: 'Position fehlt',
  EXTRA_ITEM: 'Zusätzliche Position',
  MISSING_DISCOUNT: 'Rabatt fehlt',
  BILLING_ANCHOR_MISMATCH: 'Abrechnungsanker weicht ab',
  MISSING_DEFAULT_PAYMENT_METHOD: 'Keine Standard-Zahlungsmethode',
  MISSING_LOCAL_INVOICE: 'Rechnung lokal fehlt',
  MISSING_LOCAL_PAYMENT: 'Zahlung lokal fehlt',
  LOCAL_SUBSCRIPTION_WITHOUT_STRIPE: 'Vertrag ohne Stripe-Abo',
  STRIPE_SUBSCRIPTION_WITHOUT_LOCAL: 'Stripe-Abo ohne lokalen Vertrag',
  STUCK_WEBHOOK: 'Hängender Webhook',
  TEST_LIVE_MODE_CONFLICT: 'Test/Live-Konflikt',
};

@Injectable()
export class BillingSubscriptionsOperationalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billableVehicles: BillableVehiclesService,
    private readonly usageService: BillingUsageService,
    private readonly entitlementResolver: BillingEntitlementResolver,
    private readonly billingAdmin: BillingAdminService,
  ) {}

  async getOverviewOperational(): Promise<BillingOverviewOperationalDto> {
    const [base, adminOverview] = await Promise.all([
      this.loadBaseOverviewCounts(),
      this.billingAdmin.getOverview(),
    ]);
    const stripeStatus = await this.prisma.stripeWebhookEvent.findFirst({
      where: { status: 'PROCESSED' },
      orderBy: { processedAt: 'desc' },
      select: { processedAt: true },
    });

    const lastReconciliation = await this.prisma.billingAuditLog.findFirst({
      where: { action: { contains: 'RECONCILIATION' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    let billingHealth: BillingOverviewOperationalDto['billingHealth'] = 'healthy';
    if (
      base.pastDueSubscriptions > 0 ||
      base.openReconciliationDrifts > 0 ||
      base.failedPayments > 0
    ) {
      billingHealth = 'critical';
    } else if (
      base.trialsExpiringCount > 0 ||
      base.webhookFailures > 0 ||
      base.missingPaymentMethods > 0
    ) {
      billingHealth = 'attention';
    }

    const billingHealthLabel =
      billingHealth === 'healthy'
        ? 'Billing gesund'
        : billingHealth === 'attention'
          ? 'Aufmerksamkeit nötig'
          : 'Kritisch';

    return {
      billingHealth,
      billingHealthLabel,
      activeSubscriptions: base.activeSubscriptions,
      trialingSubscriptions: base.trialingSubscriptions,
      pastDueSubscriptions: base.pastDueSubscriptions,
      openReconciliationDrifts: base.openReconciliationDrifts,
      failedPayments: base.failedPayments,
      trialsExpiringCount: base.trialsExpiringCount,
      webhookFailures: base.webhookFailures,
      missingPaymentMethods: base.missingPaymentMethods,
      openInvoices: base.openInvoices,
      reconciliationLastRunAt: lastReconciliation?.createdAt.toISOString() ?? null,
      lastSuccessfulWebhookAt: stripeStatus?.processedAt?.toISOString() ?? null,
      loadedAt: new Date().toISOString(),
      mrr: adminOverview.mrrIncomplete ? null : adminOverview.mrr,
      arr: adminOverview.mrrIncomplete ? null : adminOverview.arr,
      mrrIncomplete: adminOverview.mrrIncomplete ?? false,
      mrrIncompleteReason: adminOverview.mrrIncompleteReason ?? null,
    };
  }

  async findEnrichedDrifts(filters?: {
    organizationId?: string;
    severity?: string;
  }): Promise<BillingReconciliationDriftEnrichedDto[]> {
    const drifts = await this.prisma.billingReconciliationDrift.findMany({
      where: {
        organizationId: filters?.organizationId,
        severity: filters?.severity as never,
        resolvedAt: null,
      },
      include: {
        organization: { select: { companyName: true } },
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    });

    return drifts.map((drift) => ({
      id: drift.id,
      organizationId: drift.organizationId,
      organizationName: drift.organization.companyName,
      subscriptionId: drift.subscriptionId,
      driftType: drift.driftType,
      driftTypeLabel: BillingSubscriptionsOperationalService.driftTypeLabel(drift.driftType),
      severity: drift.severity,
      field: null,
      localValue: drift.localValue,
      stripeValue: drift.stripeValue,
      detectedAt: drift.detectedAt.toISOString(),
      resolvedAt: drift.resolvedAt?.toISOString() ?? null,
      autoFixable: drift.autoFixable,
      resolutionState: drift.resolvedAt ? 'resolved' : 'open',
    }));
  }

  async findAllOperational(query: BillingSubscriptionsOperationalQueryDto) {
    const { skip, take } = parsePagination(query);
    const where = this.buildOrgWhere(query);

    const orgs = await this.prisma.organization.findMany({
      where,
      orderBy: { companyName: 'asc' },
      select: {
        id: true,
        companyName: true,
        status: true,
        updatedAt: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            items: {
              where: { itemRole: BillingSubscriptionItemRole.BASE_PLAN },
              orderBy: { validFrom: 'desc' },
              take: 1,
              include: {
                billingProduct: { select: { key: true, name: true } },
                priceVersion: {
                  select: { id: true, versionNumber: true, versionLabel: true },
                },
                priceBook: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const orgIds = orgs.map((o) => o.id);
    const [driftByOrg, failedPaymentByOrg, openByOrg, enrichmentByOrg] = await Promise.all([
      this.loadDriftCountsByOrg(orgIds),
      this.loadFailedPaymentByOrg(orgIds),
      this.loadOpenAmountsByOrg(orgIds),
      this.loadEnrichmentByOrgIds(orgIds),
    ]);

    let rows = orgs.map((org) =>
      this.composeRow(
        org,
        enrichmentByOrg.get(org.id),
        driftByOrg.get(org.id) ?? 0,
        failedPaymentByOrg.has(org.id),
        openByOrg.get(org.id) ?? 0,
      ),
    );

    rows = this.applyEnrichedFilters(rows, query);
    rows = this.sortRows(rows, query);

    const total = rows.length;
    rows = rows.slice(skip, skip + take);

    return buildPaginatedResult(rows, total, query);
  }

  async getOperationalDetail(organizationId: string): Promise<BillingSubscriptionOperationalDetailDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        companyName: true,
        status: true,
        updatedAt: true,
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
                  select: { id: true, versionNumber: true, versionLabel: true },
                },
                priceBook: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const [driftCount, failedPaymentByOrg, openByOrg, enrichment] = await Promise.all([
      this.prisma.billingReconciliationDrift.count({
        where: { organizationId, resolvedAt: null },
      }),
      this.loadFailedPaymentByOrg([organizationId]),
      this.loadOpenAmountsByOrg([organizationId]),
      this.loadEnrichmentByOrgIds([organizationId]),
    ]);

    const row = this.composeRow(
      org,
      enrichment.get(organizationId),
      driftCount,
      failedPaymentByOrg.has(organizationId),
      openByOrg.get(organizationId) ?? 0,
    );

    const sub = org.subscriptions[0] ?? null;
    const baseItem = sub?.items[0] ?? null;
    const preview = enrichment.get(organizationId)?.preview;

    return {
      ...row,
      organizationStatus: org.status,
      startedAt: sub?.startedAt?.toISOString() ?? null,
      cancelAt: sub?.cancelAt?.toISOString() ?? null,
      billingAnchorDay: sub?.billingAnchorDay ?? null,
      billableVehicleCount: enrichment.get(organizationId)?.billableVehicleCount ?? 0,
      connectedVehicleCount: enrichment.get(organizationId)?.connectedVehicleCount ?? 0,
      projectedMonthlyAmountCents: preview?.totalCents ?? null,
      priceVersionId: baseItem?.priceVersionId ?? null,
      priceVersionLabel:
        baseItem?.priceVersion?.versionLabel ??
        (baseItem?.priceVersion ? `v${baseItem.priceVersion.versionNumber}` : null),
      priceBookName: baseItem?.priceBook?.name ?? null,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
      openDriftCount: driftCount,
      lastFailedPaymentAt: enrichment.get(organizationId)?.lastFailedPaymentAt ?? null,
      lastInvoice: sub?.invoices[0]
        ? {
            id: sub.invoices[0].id,
            amountCents: sub.invoices[0].amountCents,
            status: sub.invoices[0].status,
            invoiceDate: sub.invoices[0].invoiceDate.toISOString(),
          }
        : null,
    };
  }

  private async loadBaseOverviewCounts() {
    const now = new Date();
    const trialThreshold = new Date(now);
    trialThreshold.setDate(trialThreshold.getDate() + 7);

    const [
      subs,
      openInvoices,
      failedPayments,
      reconciliationDrifts,
      webhookFailures,
      missingPaymentMethods,
      trialsExpiring,
    ] = await Promise.all([
      this.prisma.billingSubscription.findMany({
        select: { status: true },
      }),
      this.prisma.billingInvoice.count({ where: { status: InvoiceStatus.OPEN } }),
      this.prisma.billingPayment.count({ where: { status: 'FAILED' } }),
      this.prisma.billingReconciliationDrift.count({ where: { resolvedAt: null } }),
      this.prisma.stripeWebhookEvent.count({ where: { status: 'FAILED' } }),
      this.countOrgsMissingPaymentMethod(),
      this.prisma.billingSubscription.count({
        where: {
          status: BillingStatus.TRIALING,
          trialEndAt: { lte: trialThreshold, gte: now },
        },
      }),
    ]);

    let activeSubscriptions = 0;
    let trialingSubscriptions = 0;
    let pastDueSubscriptions = 0;
    for (const sub of subs) {
      if (sub.status === BillingStatus.ACTIVE) activeSubscriptions++;
      if (sub.status === BillingStatus.TRIALING) trialingSubscriptions++;
      if (sub.status === BillingStatus.PAST_DUE) pastDueSubscriptions++;
    }

    return {
      activeSubscriptions,
      trialingSubscriptions,
      pastDueSubscriptions,
      openInvoices,
      failedPayments,
      openReconciliationDrifts: reconciliationDrifts,
      webhookFailures,
      missingPaymentMethods,
      trialsExpiringCount: trialsExpiring,
    };
  }

  private async countOrgsMissingPaymentMethod(): Promise<number> {
    const activeSubs = await this.prisma.billingSubscription.findMany({
      where: {
        status: { in: [BillingStatus.ACTIVE, BillingStatus.TRIALING, BillingStatus.PAST_DUE] },
      },
      select: { organizationId: true },
    });
    const orgIds = [...new Set(activeSubs.map((s) => s.organizationId))];
    if (orgIds.length === 0) return 0;

    const withPm = await this.prisma.billingPaymentMethod.findMany({
      where: { organizationId: { in: orgIds }, isDefault: true },
      select: { organizationId: true },
    });
    const withPmSet = new Set(withPm.map((p) => p.organizationId));
    return orgIds.filter((id) => !withPmSet.has(id)).length;
  }

  private buildOrgWhere(query: BillingSubscriptionsOperationalQueryDto): Prisma.OrganizationWhereInput {
    const where: Prisma.OrganizationWhereInput = {};

    if (query.search?.trim()) {
      const s = query.search.trim();
      where.companyName = { contains: s, mode: 'insensitive' };
    }

    if (query.productKey) {
      where.subscriptions = {
        some: {
          items: {
            some: {
              itemRole: BillingSubscriptionItemRole.BASE_PLAN,
              billingProduct: { key: query.productKey },
            },
          },
        },
      };
    }

    return where;
  }

  private applyEnrichedFilters(
    rows: BillingSubscriptionOperationalRowDto[],
    query: BillingSubscriptionsOperationalQueryDto,
  ): BillingSubscriptionOperationalRowDto[] {
    let filtered = rows;

    if (query.domainStatus) {
      filtered = filtered.filter((r) => r.domainStatus === query.domainStatus);
    }
    if (query.billingHealth) {
      filtered = filtered.filter((r) => r.billingHealth === query.billingHealth);
    }
    if (query.reconciliationHealth) {
      filtered = filtered.filter((r) => r.reconciliationHealth === query.reconciliationHealth);
    }
    if (query.attention === 'yes') {
      filtered = filtered.filter((r) => r.attention.severity !== 'none');
    } else if (query.attention === 'critical') {
      filtered = filtered.filter((r) => r.attention.severity === 'critical');
    } else if (query.attention === 'warning') {
      filtered = filtered.filter(
        (r) => r.attention.severity === 'warning' || r.attention.severity === 'info',
      );
    }
    if (query.attentionCode) {
      filtered = filtered.filter((r) => r.attention.reasons.includes(query.attentionCode!));
    }
    if (query.trialState === 'active') {
      filtered = filtered.filter((r) => r.trial.active);
    } else if (query.trialState === 'expiring') {
      filtered = filtered.filter(
        (r) =>
          r.trial.daysRemaining != null &&
          r.trial.daysRemaining <= 7 &&
          r.trial.daysRemaining >= 0,
      );
    } else if (query.trialState === 'none') {
      filtered = filtered.filter((r) => !r.trial.active);
    }

    return filtered;
  }

  private sortRows(
    rows: BillingSubscriptionOperationalRowDto[],
    query: BillingSubscriptionsOperationalQueryDto,
  ): BillingSubscriptionOperationalRowDto[] {
    const sort = query.sort ?? 'attention';
    const dir = query.sortDir === 'asc' ? 1 : -1;
    const severityRank: Record<string, number> = {
      critical: 4,
      warning: 3,
      info: 2,
      none: 1,
    };

    return [...rows].sort((a, b) => {
      if (sort === 'attention') {
        const diff =
          (severityRank[b.attention.severity] ?? 0) - (severityRank[a.attention.severity] ?? 0);
        if (diff !== 0) return diff * dir;
        return a.companyName.localeCompare(b.companyName, 'de');
      }
      if (sort === 'companyName') {
        return a.companyName.localeCompare(b.companyName, 'de') * dir;
      }
      if (sort === 'nextChargeAt') {
        return (a.nextChargeAt ?? '').localeCompare(b.nextChargeAt ?? '') * dir;
      }
      if (sort === 'domainStatus') {
        return a.domainStatus.localeCompare(b.domainStatus) * dir;
      }
      return 0;
    });
  }

  private composeRow(
    org: {
      id: string;
      companyName: string;
      updatedAt: Date;
      subscriptions: Array<{
        id: string;
        status: BillingStatus;
        lockVersion: number;
        currentPeriodEnd: Date | null;
        trialStartAt: Date | null;
        trialEndAt: Date | null;
        startedAt: Date | null;
        endedAt: Date | null;
        cancelAtPeriodEnd: boolean;
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
        updatedAt?: Date;
        items: Array<{
          status: BillingSubscriptionItemStatus;
          billingProduct: { key: string; name: string } | null;
        }>;
      }>;
    },
    enrichment:
      | {
          warnings: string[];
          syncStatus: 'NONE' | 'SYNCED' | 'PARTIAL' | 'MISSING';
          paymentMethodStatus: string;
          productKey: string | null;
          tariffLabel: string | null;
        }
      | undefined,
    openDriftCount: number,
    hasFailedPayment: boolean,
    openAmountCents: number,
  ): BillingSubscriptionOperationalRowDto {
    const sub = org.subscriptions[0] ?? null;
    const baseItem = sub?.items[0] ?? null;

    const domainStatus = sub
      ? resolveSubscriptionDomainStatus({
          status: sub.status,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          trialStartAt: sub.trialStartAt,
          startedAt: sub.startedAt,
          endedAt: sub.endedAt,
          baseItemStatus: baseItem?.status ?? null,
        })
      : 'NONE';

    const trial = this.buildTrialDto(sub, domainStatus);
    const syncStatus = enrichment?.syncStatus ?? 'NONE';
    const warnings = enrichment?.warnings ?? [];

    const attention = buildBillingAttention({
      warnings,
      domainStatus,
      syncStatus,
      hasOpenDrift: openDriftCount > 0,
      hasFailedPayment,
      trialExpiringWithinDays: trial.daysRemaining,
      paymentMethodStatus: enrichment?.paymentMethodStatus ?? 'MISSING',
    });

    return {
      organizationId: org.id,
      companyName: org.companyName,
      subscriptionId: sub?.id ?? null,
      domainStatus,
      domainStatusLabel: DOMAIN_STATUS_LABELS[domainStatus] ?? domainStatus,
      productKey: enrichment?.productKey ?? baseItem?.billingProduct?.key ?? null,
      tariffLabel: enrichment?.tariffLabel ?? baseItem?.billingProduct?.name ?? null,
      billingHealth: deriveBillingHealthFromAttention(attention),
      reconciliationHealth: deriveReconciliationHealth(syncStatus, openDriftCount > 0),
      syncStatus,
      paymentMethodStatus: enrichment?.paymentMethodStatus ?? 'MISSING',
      trial,
      nextChargeAt: sub?.currentPeriodEnd?.toISOString() ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      openAmountCents,
      attention,
      warnings,
      lockVersion: sub?.lockVersion ?? null,
      updatedAt: sub?.updatedAt?.toISOString() ?? org.updatedAt.toISOString(),
    };
  }

  private buildTrialDto(
    sub: {
      trialStartAt: Date | null;
      trialEndAt: Date | null;
      stripeSubscriptionId: string | null;
    } | null,
    domainStatus: string,
  ): BillingTrialDto {
    if (!sub || domainStatus !== 'TRIALING') {
      return {
        source: 'NONE',
        active: false,
        startedAt: sub?.trialStartAt?.toISOString() ?? null,
        endsAt: sub?.trialEndAt?.toISOString() ?? null,
        daysRemaining: null,
        conversionState: 'NONE',
      };
    }

    const now = Date.now();
    const endsAt = sub.trialEndAt;
    const daysRemaining =
      endsAt != null
        ? Math.ceil((endsAt.getTime() - now) / (1000 * 60 * 60 * 24))
        : null;

    let conversionState: BillingTrialDto['conversionState'] = 'ACTIVE';
    if (daysRemaining != null && daysRemaining < 0) conversionState = 'EXPIRED';
    else if (daysRemaining != null && daysRemaining <= 7) conversionState = 'EXPIRING';

    const source: BillingTrialDto['source'] =
      sub.trialStartAt != null ? 'SYNQDRIVE' : sub.stripeSubscriptionId ? 'STRIPE' : 'SYNQDRIVE';

    return {
      source,
      active: true,
      startedAt: sub.trialStartAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      daysRemaining,
      conversionState,
    };
  }

  private async loadDriftCountsByOrg(orgIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (orgIds.length === 0) return map;
    const rows = await this.prisma.billingReconciliationDrift.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: orgIds }, resolvedAt: null },
      _count: { id: true },
    });
    for (const row of rows) {
      map.set(row.organizationId, row._count.id);
    }
    return map;
  }

  private async loadFailedPaymentByOrg(orgIds: string[]): Promise<Set<string>> {
    if (orgIds.length === 0) return new Set();
    const rows = await this.prisma.billingPayment.findMany({
      where: {
        status: 'FAILED',
        invoice: { subscription: { organizationId: { in: orgIds } } },
      },
      select: { invoice: { select: { subscription: { select: { organizationId: true } } } } },
      distinct: ['invoiceId'],
    });
    return new Set(rows.map((r) => r.invoice.subscription.organizationId));
  }

  private async loadOpenAmountsByOrg(orgIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (orgIds.length === 0) return map;
    const rows = await this.prisma.billingInvoice.findMany({
      where: { status: InvoiceStatus.OPEN, subscription: { organizationId: { in: orgIds } } },
      select: { amountCents: true, subscription: { select: { organizationId: true } } },
    });
    for (const row of rows) {
      const oid = row.subscription.organizationId;
      map.set(oid, (map.get(oid) ?? 0) + row.amountCents);
    }
    return map;
  }

  private async loadEnrichmentByOrgIds(orgIds: string[]) {
    type Enrichment = {
      warnings: string[];
      syncStatus: 'NONE' | 'SYNCED' | 'PARTIAL' | 'MISSING';
      paymentMethodStatus: string;
      productKey: string | null;
      tariffLabel: string | null;
      billableVehicleCount: number;
      connectedVehicleCount: number;
      preview: Awaited<ReturnType<BillingUsageService['previewUsage']>>;
      lastFailedPaymentAt: string | null;
    };

    const map = new Map<string, Enrichment>();
    if (orgIds.length === 0) return map;

    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: {
        id: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            items: {
              where: { itemRole: BillingSubscriptionItemRole.BASE_PLAN },
              orderBy: { validFrom: 'desc' },
              take: 1,
              include: { billingProduct: { select: { key: true, name: true } } },
            },
          },
        },
      },
    });

    await Promise.all(
      orgs.map(async (org) => {
        const sub = org.subscriptions[0] ?? null;
        const [vehicles, preview, paymentMethod, entitlements, lastFailed] = await Promise.all([
          this.billableVehicles.getBillableConnectedVehiclesForOrganization(org.id),
          this.usageService.previewUsage(org.id),
          this.prisma.billingPaymentMethod.findFirst({
            where: { organizationId: org.id, isDefault: true },
            orderBy: { createdAt: 'desc' },
          }),
          this.entitlementResolver.resolve(org.id),
          this.prisma.billingPayment.findFirst({
            where: {
              status: 'FAILED',
              invoice: { subscription: { organizationId: org.id } },
            },
            orderBy: { failedAt: 'desc' },
            select: { failedAt: true },
          }),
        ]);

        const warnings: string[] = [];
        if (!paymentMethod) warnings.push('PAYMENT_METHOD_MISSING');
        if (preview.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED) {
          warnings.push('PRICE_NOT_CONFIGURED');
        }
        if (preview.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION) {
          warnings.push('NO_ACTIVE_PRICE_VERSION');
        }
        if (sub?.status === BillingStatus.PAST_DUE) warnings.push('PAST_DUE');
        if (!sub) warnings.push('SUBSCRIPTION_MISSING');

        const stripeCustomerMapped = Boolean(sub?.stripeCustomerId);
        const stripeSubscriptionMapped = Boolean(sub?.stripeSubscriptionId);
        const syncStatus = !sub
          ? 'NONE'
          : stripeCustomerMapped && stripeSubscriptionMapped
            ? 'SYNCED'
            : stripeCustomerMapped || stripeSubscriptionMapped
              ? 'PARTIAL'
              : 'MISSING';

        const baseItem = sub?.items[0] ?? null;

        map.set(org.id, {
          warnings: [...warnings, ...preview.warnings],
          syncStatus,
          paymentMethodStatus: paymentMethod?.status ?? 'MISSING',
          productKey: baseItem?.billingProduct?.key ?? null,
          tariffLabel:
            entitlements.baseProduct === 'RENTAL'
              ? 'Rental'
              : entitlements.baseProduct === 'FLEET'
                ? 'Fleet'
                : baseItem?.billingProduct?.name ?? null,
          billableVehicleCount: vehicles.billableVehicleCount,
          connectedVehicleCount: vehicles.connectedVehicleCount,
          preview,
          lastFailedPaymentAt: lastFailed?.failedAt?.toISOString() ?? null,
        });
      }),
    );

    return map;
  }

  static driftTypeLabel(driftType: string): string {
    return DRIFT_TYPE_LABELS[driftType] ?? driftType;
  }
}
