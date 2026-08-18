import {
  BillingStatus,
  BillingSubscriptionItemRole,
  BillingUsageCalculationStatus,
  BusinessType,
  IntegrationStatus,
  OrganizationStatus,
  Prisma,
} from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  PaginationParams,
} from '@shared/utils/pagination';
import { BillableVehiclesService } from '@modules/billing/billable-vehicles.service';
import { BillingUsageService } from '@modules/billing/billing-usage.service';
import { BillingEntitlementResolver } from '@modules/billing/billing-entitlement-resolver.service';
import {
  buildOrganizationAttention,
  classifyConnectivityHealth,
  deriveBillingHealth,
} from './organization-attention.util';
import type {
  OrganizationConnectivitySummaryDto,
  OrganizationOperationalDetailDto,
  OrganizationOperationalQueryDto,
  OrganizationOperationalRowDto,
} from './organizations-operational.types';

const ORG_STATUS_LABEL: Record<OrganizationStatus, string> = {
  ACTIVE: 'Aktiv',
  PENDING: 'Einrichtung',
  SUSPENDED: 'Gesperrt',
  ARCHIVED: 'Archiviert',
};

const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktiv',
  TRIALING: 'Testphase',
  PAST_DUE: 'Überfällig',
  CANCELLED: 'Gekündigt',
  PAUSED: 'Pausiert',
  NONE: 'Kein Abo',
};

const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  RENTAL: 'Vermietung',
  FLEET: 'Flotte',
  TAXI: 'Taxi',
  LOGISTICS: 'Logistik',
  OTHER: 'Sonstiges',
};

@Injectable()
export class OrganizationsOperationalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billableVehicles: BillableVehiclesService,
    private readonly usageService: BillingUsageService,
    private readonly entitlementResolver: BillingEntitlementResolver,
  ) {}

  async findAllOperational(query: OrganizationOperationalQueryDto) {
    const { skip, take } = parsePagination(query);
    const where = this.buildOrgWhere(query);

    const [orgs, totalBeforeEnrichment] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { companyName: 'asc' },
        select: {
          id: true,
          companyName: true,
          shortCode: true,
          businessType: true,
          status: true,
          city: true,
          country: true,
          email: true,
          createdAt: true,
          lastActiveAt: true,
          updatedAt: true,
          paymentsEnabled: true,
          memberships: {
            where: { status: 'ACTIVE' },
            select: { id: true },
          },
          orgIntegrations: { select: { status: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const orgIds = orgs.map((o) => o.id);
    const [billingByOrg, driftOrgIds, connectivityByOrg] = await Promise.all([
      this.loadBillingByOrgIds(orgIds),
      this.loadDriftOrgIds(orgIds),
      this.loadConnectivityByOrgIds(orgIds),
    ]);

    let rows = orgs.map((org) =>
      this.composeRow(org, billingByOrg.get(org.id), driftOrgIds.has(org.id), connectivityByOrg.get(org.id)),
    );

    rows = this.applyEnrichedFilters(rows, query);

    const total =
      query.attention || query.billingHealth || query.connectivity
        ? rows.length
        : totalBeforeEnrichment;

    if (query.attention || query.billingHealth || query.connectivity) {
      rows = rows.slice(skip, skip + take);
    }

    return buildPaginatedResult(rows, total, query);
  }

  async getOperationalDetail(orgId: string): Promise<OrganizationOperationalDetailDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        companyName: true,
        shortCode: true,
        businessType: true,
        status: true,
        city: true,
        country: true,
        email: true,
        createdAt: true,
        lastActiveAt: true,
        updatedAt: true,
        paymentsEnabled: true,
        memberships: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
        orgIntegrations: {
          select: {
            status: true,
            lastSyncAt: true,
            errorMessage: true,
            integration: { select: { name: true, slug: true } },
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const [billingByOrg, driftOrgIds, connectivity] = await Promise.all([
      this.loadBillingByOrgIds([orgId]),
      this.loadDriftOrgIds([orgId]),
      this.getOrganizationConnectivitySummary(orgId),
    ]);

    const row = this.composeRow(
      org,
      billingByOrg.get(orgId),
      driftOrgIds.has(orgId),
      connectivity,
    );

    const integrations = org.orgIntegrations.map((i) => ({
      name: i.integration.name,
      slug: i.integration.slug,
      status: i.status,
      statusLabel: this.integrationStatusLabel(i.status),
      lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      errorMessage: i.errorMessage ?? null,
    }));

    return {
      ...row,
      contactEmail: org.email ?? '',
      activeMembershipCount: org.memberships.length,
      integrations,
      connectivity,
    };
  }

  async getOrganizationConnectivitySummary(
    organizationId: string,
  ): Promise<OrganizationConnectivitySummaryDto> {
    const { resolveTelemetryFreshness } = await import(
      '../vehicles/telemetry-freshness.resolver'
    );
    const now = Date.now();

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, dimoVehicle: { isNot: null } },
      select: {
        latestState: { select: { lastSeenAt: true, updatedAt: true } },
        dimoVehicle: { select: { lastSignal: true } },
      },
    });

    const freshness = {
      live: 0,
      standby: 0,
      signal_delayed: 0,
      offline: 0,
      no_signal: 0,
    };

    for (const v of vehicles) {
      const resolved = resolveTelemetryFreshness(
        {
          lastSignal: v.dimoVehicle?.lastSignal ?? null,
          latestStateUpdatedAt: v.latestState?.lastSeenAt ?? v.latestState?.updatedAt ?? null,
        },
        now,
      );
      freshness[resolved.freshness] += 1;
    }

    const health = classifyConnectivityHealth(vehicles.length, freshness);

    return {
      organizationId,
      generatedAt: new Date(now).toISOString(),
      dimoLinkedVehicles: vehicles.length,
      freshness,
      health,
    };
  }

  private buildOrgWhere(query: OrganizationOperationalQueryDto): Prisma.OrganizationWhereInput {
    const where: Prisma.OrganizationWhereInput = {};

    if (query.orgStatus) {
      where.status = query.orgStatus as OrganizationStatus;
    }

    if (query.businessType) {
      where.businessType = query.businessType as BusinessType;
    }

    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { companyName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { city: { contains: s, mode: 'insensitive' } },
        { shortCode: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (query.subscriptionStatus && query.subscriptionStatus !== 'NONE') {
      where.subscriptions = {
        some: { status: query.subscriptionStatus as BillingStatus },
      };
    }
    if (query.subscriptionStatus === 'NONE') {
      where.subscriptions = { none: {} };
    }

    if (query.paymentMethod === 'present') {
      where.billingPaymentMethods = { some: { isDefault: true } };
    }
    if (query.paymentMethod === 'missing') {
      where.billingPaymentMethods = { none: { isDefault: true } };
    }

    if (query.syncStatus === 'NONE') {
      where.subscriptions = { none: {} };
    }

    return where;
  }

  private applyEnrichedFilters(
    rows: OrganizationOperationalRowDto[],
    query: OrganizationOperationalQueryDto,
  ): OrganizationOperationalRowDto[] {
    let filtered = rows;

    if (query.attention === 'yes') {
      filtered = filtered.filter((r) => r.attention.severity !== 'none');
    } else if (query.attention === 'critical') {
      filtered = filtered.filter((r) => r.attention.severity === 'critical');
    } else if (query.attention === 'warning') {
      filtered = filtered.filter((r) => r.attention.severity === 'warning');
    }

    if (query.billingHealth) {
      filtered = filtered.filter((r) => r.billingHealth === query.billingHealth);
    }

    if (query.connectivity) {
      filtered = filtered.filter((r) => r.connectivityHealth === query.connectivity);
    }

    if (query.syncStatus && query.syncStatus !== 'NONE') {
      filtered = filtered.filter((r) => r.syncStatus === query.syncStatus);
    }

    return filtered;
  }

  private composeRow(
    org: {
      id: string;
      companyName: string;
      shortCode: string | null;
      businessType: BusinessType;
      status: OrganizationStatus;
      city: string | null;
      country: string | null;
      createdAt: Date;
      lastActiveAt: Date | null;
      updatedAt: Date;
      paymentsEnabled: boolean;
      memberships: { id: string }[];
      orgIntegrations: { status: IntegrationStatus }[];
    },
    billing: Awaited<ReturnType<OrganizationsOperationalService['loadBillingByOrgIds']>> extends Map<
      string,
      infer V
    >
      ? V
      : never,
    hasDrift: boolean,
    connectivity?: OrganizationConnectivitySummaryDto,
  ): OrganizationOperationalRowDto {
    const subscriptionStatus = billing?.subscriptionStatus ?? 'NONE';
    const warnings = billing?.warnings ?? [];
    const syncStatus = billing?.syncStatus ?? 'NONE';
    const connectivityHealth = connectivity?.health ?? 'ok';
    const hasIntegrationError = org.orgIntegrations.some((i) => i.status === IntegrationStatus.ERROR);

    const attention = buildOrganizationAttention({
      orgStatus: org.status,
      billingWarnings: warnings,
      syncStatus,
      hasActiveSubscription: subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'TRIALING',
      hasIntegrationError,
      connectivityHealth,
      hasReconciliationDrift: hasDrift,
    });

    const billingHealth = deriveBillingHealth(warnings, syncStatus);

    return {
      id: org.id,
      companyName: org.companyName,
      shortCode: org.shortCode,
      businessType: org.businessType,
      businessTypeLabel: BUSINESS_TYPE_LABEL[org.businessType] ?? org.businessType,
      city: org.city ?? '',
      country: org.country ?? '',
      orgStatus: org.status,
      orgStatusLabel: ORG_STATUS_LABEL[org.status],
      subscriptionStatus,
      subscriptionStatusLabel:
        SUBSCRIPTION_STATUS_LABEL[subscriptionStatus] ?? subscriptionStatus,
      billingHealth,
      syncStatus,
      paymentMethodStatus: billing?.paymentMethodStatus ?? 'MISSING',
      connectedVehicleCount: billing?.connectedVehicleCount ?? 0,
      billableVehicleCount: billing?.billableVehicleCount ?? 0,
      activeMembershipCount: org.memberships.length,
      tariffLabel: billing?.tariffLabel ?? null,
      nextChargeAt: billing?.nextChargeAt ?? null,
      openAmountCents: billing?.openAmountCents ?? 0,
      warnings,
      attention,
      connectivityHealth,
      connectivitySummary: connectivity,
      lastActiveAt:
        org.lastActiveAt?.toISOString() ?? org.updatedAt.toISOString(),
      createdAt: org.createdAt.toISOString(),
      paymentsEnabled: org.paymentsEnabled,
    };
  }

  private async loadDriftOrgIds(orgIds: string[]): Promise<Set<string>> {
    if (orgIds.length === 0) return new Set();
    const rows = await this.prisma.billingReconciliationDrift.findMany({
      where: { organizationId: { in: orgIds }, resolvedAt: null },
      select: { organizationId: true },
    });
    return new Set(rows.map((r) => r.organizationId));
  }

  private async loadConnectivityByOrgIds(
    orgIds: string[],
  ): Promise<Map<string, OrganizationConnectivitySummaryDto>> {
    const map = new Map<string, OrganizationConnectivitySummaryDto>();
    if (orgIds.length === 0) return map;

    const { resolveTelemetryFreshness } = await import(
      '../vehicles/telemetry-freshness.resolver'
    );
    const now = Date.now();
    const generatedAt = new Date(now).toISOString();

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: { in: orgIds }, dimoVehicle: { isNot: null } },
      select: {
        organizationId: true,
        latestState: { select: { lastSeenAt: true, updatedAt: true } },
        dimoVehicle: { select: { lastSignal: true } },
      },
    });

    const buckets = new Map<string, OrganizationConnectivitySummaryDto['freshness']>();
    for (const id of orgIds) {
      buckets.set(id, { live: 0, standby: 0, signal_delayed: 0, offline: 0, no_signal: 0 });
    }

    for (const v of vehicles) {
      const bucket = buckets.get(v.organizationId)!;
      const resolved = resolveTelemetryFreshness(
        {
          lastSignal: v.dimoVehicle?.lastSignal ?? null,
          latestStateUpdatedAt: v.latestState?.lastSeenAt ?? v.latestState?.updatedAt ?? null,
        },
        now,
      );
      bucket[resolved.freshness] += 1;
    }

    for (const id of orgIds) {
      const freshness = buckets.get(id)!;
      const dimoLinked = Object.values(freshness).reduce((a, b) => a + b, 0);
      const health = classifyConnectivityHealth(dimoLinked, freshness);
      map.set(id, {
        organizationId: id,
        generatedAt,
        dimoLinkedVehicles: dimoLinked,
        freshness,
        health,
      });
    }

    return map;
  }

  private async loadBillingByOrgIds(orgIds: string[]) {
    const map = new Map<
      string,
      {
        subscriptionStatus: string;
        warnings: string[];
        syncStatus: 'NONE' | 'SYNCED' | 'PARTIAL' | 'MISSING';
        paymentMethodStatus: string;
        connectedVehicleCount: number;
        billableVehicleCount: number;
        tariffLabel: string | null;
        nextChargeAt: string | null;
        openAmountCents: number;
      }
    >();

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
              include: {
                billingProduct: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const openInvoices = await this.prisma.billingInvoice.findMany({
      where: { status: 'OPEN', subscription: { organizationId: { in: orgIds } } },
      select: { amountCents: true, subscription: { select: { organizationId: true } } },
    });
    const openByOrg = new Map<string, number>();
    for (const inv of openInvoices) {
      const oid = inv.subscription.organizationId;
      openByOrg.set(oid, (openByOrg.get(oid) ?? 0) + inv.amountCents);
    }

    await Promise.all(
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

        map.set(org.id, {
          subscriptionStatus: sub?.status ?? 'NONE',
          warnings: [...warnings, ...preview.warnings],
          syncStatus,
          paymentMethodStatus: paymentMethod?.status ?? 'MISSING',
          connectedVehicleCount: vehicles.connectedVehicleCount,
          billableVehicleCount: vehicles.billableVehicleCount,
          tariffLabel:
            entitlements.baseProduct === 'RENTAL'
              ? 'Rental'
              : entitlements.baseProduct === 'FLEET'
                ? 'Fleet'
                : baseItem?.billingProduct?.name ?? null,
          nextChargeAt: sub?.currentPeriodEnd?.toISOString() ?? null,
          openAmountCents: openByOrg.get(org.id) ?? 0,
        });
      }),
    );

    return map;
  }

  private integrationStatusLabel(status: IntegrationStatus): string {
    switch (status) {
      case IntegrationStatus.ACTIVE:
        return 'Verbunden';
      case IntegrationStatus.ERROR:
        return 'Fehler';
      default:
        return 'Getrennt';
    }
  }
}
