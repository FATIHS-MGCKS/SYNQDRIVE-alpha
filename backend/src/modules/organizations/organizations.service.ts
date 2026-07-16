import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  OrganizationStatus,
  BusinessType,
  BillingStatus,
  MembershipStatus,
  BookingStatus,
  VehicleStatus,
  ActivityAction,
  ActivityEntity,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { UpdateTenantOrganizationProfileDto } from './dto/update-tenant-organization-profile.dto';
import {
  TENANT_PROFILE_CRITICAL_FIELDS,
  TenantOrganizationProfileDto,
} from './types/tenant-organization-profile.types';
import {
  collectChangedFields,
  normalizeTimezoneInput,
  normalizeWebsite,
} from './utils/tenant-profile-normalizer.util';

const ORG_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'Active',
  PENDING: 'Trial',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Churned',
};

const REVERSE_ORG_STATUS: Record<string, OrganizationStatus> = {
  Active: OrganizationStatus.ACTIVE,
  Trial: OrganizationStatus.PENDING,
  Suspended: OrganizationStatus.SUSPENDED,
  Churned: OrganizationStatus.ARCHIVED,
};

const PLAN_MAP: Record<string, string> = {
  STARTER: 'Starter',
  BUSINESS: 'Business',
  PROFESSIONAL: 'Business',
  ENTERPRISE: 'Enterprise',
  CUSTOM: 'Custom',
};

const PLAN_PRIORITY: Record<string, number> = {
  CUSTOM: 5,
  ENTERPRISE: 4,
  PROFESSIONAL: 3,
  BUSINESS: 2,
  STARTER: 1,
};

const BUSINESS_TYPE_MAP: Record<string, string> = {
  RENTAL: 'Rental',
  FLEET: 'Fleet',
  TAXI: 'Taxi',
  LOGISTICS: 'Logistics',
  OTHER: 'Other',
};

const PRODUCT_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'Active',
  TRIAL: 'Active',
  SUSPENDED: 'Inactive',
  CANCELLED: 'Inactive',
};

const INTEGRATION_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'Connected',
  INACTIVE: 'Disconnected',
  ERROR: 'Error',
};

const INVOICE_STATUS_MAP: Record<string, string> = {
  PAID: 'Paid',
  OPEN: 'Pending',
  DRAFT: 'Pending',
  VOID: 'Pending',
  UNCOLLECTIBLE: 'Overdue',
};

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly organizationRoles: OrganizationRoleService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  private toBusinessTypeEnum(value: string): BusinessType {
    const map: Record<string, BusinessType> = {
      RENTAL: BusinessType.RENTAL,
      FLEET: BusinessType.FLEET,
      TAXI: BusinessType.TAXI,
      LOGISTICS: BusinessType.LOGISTICS,
      OTHER: BusinessType.OTHER,
      // display label fallbacks
      'Car Rental': BusinessType.RENTAL,
      'Fleet Management': BusinessType.FLEET,
      'Car Sharing': BusinessType.RENTAL,
      'Taxi Service': BusinessType.TAXI,
      Logistics: BusinessType.LOGISTICS,
      'Mobility Services': BusinessType.OTHER,
      Rental: BusinessType.RENTAL,
      Fleet: BusinessType.FLEET,
      Taxi: BusinessType.TAXI,
    };
    return map[value] ?? BusinessType.OTHER;
  }

  private toOrgStatusEnum(value: string): OrganizationStatus {
    const map: Record<string, OrganizationStatus> = {
      ACTIVE: OrganizationStatus.ACTIVE,
      PENDING: OrganizationStatus.PENDING,
      SUSPENDED: OrganizationStatus.SUSPENDED,
      ARCHIVED: OrganizationStatus.ARCHIVED,
      Active: OrganizationStatus.ACTIVE,
      Trial: OrganizationStatus.PENDING,
      Suspended: OrganizationStatus.SUSPENDED,
      Churned: OrganizationStatus.ARCHIVED,
    };
    return map[value] ?? OrganizationStatus.PENDING;
  }

  async create(data: Record<string, unknown>) {
    const payload: Prisma.OrganizationCreateInput = {
      companyName: String(data.companyName ?? ''),
      shortCode: data.shortCode ? String(data.shortCode).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) : undefined,
      businessType: this.toBusinessTypeEnum(String(data.businessType ?? 'OTHER')),
      status: this.toOrgStatusEnum(String(data.status ?? 'PENDING')),
      email: String(data.email ?? data.contactEmail ?? ''),
      phone: data.phone ? String(data.phone) : undefined,
      address: data.address ? String(data.address) : undefined,
      city: data.city ? String(data.city) : undefined,
      country: data.country ? String(data.country) : undefined,
      website: data.website ? String(data.website) : undefined,
    };
    const org = await this.prisma.organization.create({ data: payload });
    void this.organizationRoles.ensureDefaultRoles(org.id);
    return org;
  }

  async createWithAdmin(
    orgData: Record<string, unknown>,
    adminData: { name: string; email: string; password: string },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: adminData.email } });
    if (existing) throw new ConflictException(`User with email ${adminData.email} already exists`);

    const org = await this.create(orgData);

    const passwordHash = await bcrypt.hash(adminData.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: adminData.name,
        email: adminData.email,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    await this.prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: 'ORG_ADMIN',
        status: MembershipStatus.ACTIVE,
      },
    });

    void this.organizationRoles.ensureDefaultRoles(org.id, user.id);

    return { organization: org, admin: { id: user.id, email: user.email, name: user.name } };
  }

  async findAll(
    params?: PaginationParams & { status?: string; search?: string },
  ): Promise<PaginatedResult<any>> {
    const { skip, take } = parsePagination(params || {});
    const where: Prisma.OrganizationWhereInput = {};

    if (params?.status) {
      const mapped = REVERSE_ORG_STATUS[params.status];
      if (mapped) where.status = mapped;
    }

    if (params?.search) {
      where.OR = [
        { companyName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { city: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [orgs, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          vehicles: { select: { id: true } },
          memberships: {
            where: { status: MembershipStatus.ACTIVE },
            select: { id: true },
          },
          organizationProducts: { include: { product: true } },
          orgIntegrations: { include: { integration: true } },
          subscriptions: {
            where: {
              status: { in: [BillingStatus.ACTIVE, BillingStatus.TRIALING] },
            },
            include: {
              invoices: { orderBy: { invoiceDate: 'desc' }, take: 5 },
            },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const mapped = orgs.map((org) => this.mapOrganization(org));
    return buildPaginatedResult(mapped, total, params || {});
  }

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        vehicles: { select: { id: true, status: true } },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                lastLoginAt: true,
              },
            },
          },
        },
        organizationProducts: { include: { product: true } },
        orgIntegrations: { include: { integration: true } },
        subscriptions: {
          include: {
            invoices: { orderBy: { invoiceDate: 'desc' }, take: 10 },
          },
        },
      },
    });

    if (!org) throw new NotFoundException('Organization not found');

    return {
      ...this.mapOrganization(org),
      members: (org.memberships || []).map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user?.name || '',
        email: m.user?.email || '',
        role: m.role,
        status: m.status,
        lastLogin: m.user?.lastLoginAt?.toISOString() || null,
      })),
    };
  }

  async createOrgAdmin(
    orgId: string,
    adminData: { name: string; email: string; password: string },
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const existing = await this.prisma.user.findUnique({ where: { email: adminData.email } });
    if (existing) throw new ConflictException(`User with email ${adminData.email} already exists`);

    const passwordHash = await bcrypt.hash(adminData.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: adminData.name,
        email: adminData.email,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    await this.prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        role: 'ORG_ADMIN',
        status: MembershipStatus.ACTIVE,
      },
    });

    return { id: user.id, email: user.email, name: user.name };
  }

  async update(id: string, data: Prisma.OrganizationUpdateInput) {
    return this.prisma.organization.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.prisma.organization.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Tenant-scoped profile (used by the Rental Settings → Company Profile tab) ───
  //
  // These helpers keep the tenant-facing shape stable regardless of how the
  // underlying schema evolves. `getTenantProfile` always returns every field
  // (null when missing) so the frontend can render pre-filled inputs without
  // extra merging logic. `updateTenantProfile` only accepts a strict allow-list
  // of UI-editable fields — platform-level fields (status, shortCode,
  // businessType, lastActiveAt, createdAt, updatedAt) stay under MASTER_ADMIN
  // control via the existing `/admin/organizations` routes.

  private static readonly TENANT_PROFILE_SELECT = {
    id: true,
    companyName: true,
    legalCompanyName: true,
    legalForm: true,
    address: true,
    city: true,
    state: true,
    zip: true,
    country: true,
    taxId: true,
    taxNumber: true,
    vatId: true,
    isSmallBusiness: true,
    defaultVatRate: true,
    invoicePrefix: true,
    nextInvoiceNumber: true,
    paymentTermsDays: true,
    invoiceEmail: true,
    bankName: true,
    iban: true,
    bic: true,
    pdfFooterText: true,
    emailSignature: true,
    phone: true,
    email: true,
    website: true,
    timezone: true,
    language: true,
    managerName: true,
    managerEmail: true,
    logoUrl: true,
    logoDarkUrl: true,
    pdfLogoUrl: true,
    accentColor: true,
    businessType: true,
  } satisfies Prisma.OrganizationSelect;

  private mapTenantProfile(
    org: Prisma.OrganizationGetPayload<{ select: typeof OrganizationsService.TENANT_PROFILE_SELECT }>,
  ): TenantOrganizationProfileDto {
    return {
      id: org.id,
      companyName: org.companyName,
      legalCompanyName: org.legalCompanyName,
      legalForm: org.legalForm,
      address: org.address,
      city: org.city,
      state: org.state,
      zip: org.zip,
      country: org.country,
      taxId: org.taxId,
      taxNumber: org.taxNumber,
      vatId: org.vatId,
      isSmallBusiness: org.isSmallBusiness,
      defaultVatRate: org.defaultVatRate,
      invoicePrefix: org.invoicePrefix,
      nextInvoiceNumber: org.nextInvoiceNumber,
      paymentTermsDays: org.paymentTermsDays,
      invoiceEmail: org.invoiceEmail,
      bankName: org.bankName,
      iban: org.iban,
      bic: org.bic,
      pdfFooterText: org.pdfFooterText,
      emailSignature: org.emailSignature,
      phone: org.phone,
      email: org.email,
      website: org.website,
      timezone: org.timezone,
      language: org.language,
      managerName: org.managerName,
      managerEmail: org.managerEmail,
      logoUrl: org.logoUrl,
      logoDarkUrl: org.logoDarkUrl,
      pdfLogoUrl: org.pdfLogoUrl,
      accentColor: org.accentColor,
      businessType: org.businessType,
    };
  }

  async getTenantProfile(orgId: string): Promise<TenantOrganizationProfileDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: OrganizationsService.TENANT_PROFILE_SELECT,
    });
    if (!org) throw new NotFoundException('Organization not found');
    return this.mapTenantProfile(org);
  }

  async updateTenantProfile(
    orgId: string,
    dto: UpdateTenantOrganizationProfileDto,
    auditCtx?: {
      actorUserId?: string;
      ip?: string;
      userAgent?: string;
      route?: string;
    },
  ): Promise<TenantOrganizationProfileDto> {
    const before = await this.getTenantProfile(orgId);
    const data: Prisma.OrganizationUpdateInput = {};

    if (dto.companyName !== undefined) {
      if (!dto.companyName.trim()) {
        throw new BadRequestException('companyName cannot be empty');
      }
      data.companyName = dto.companyName.trim();
    }

    const assignNullable = <K extends keyof UpdateTenantOrganizationProfileDto>(
      key: K,
      field: keyof Prisma.OrganizationUpdateInput,
    ) => {
      const value = dto[key];
      if (value !== undefined) {
        (data as Record<string, unknown>)[field as string] = value;
      }
    };

    assignNullable('legalCompanyName', 'legalCompanyName');
    assignNullable('legalForm', 'legalForm');
    assignNullable('address', 'address');
    assignNullable('city', 'city');
    assignNullable('state', 'state');
    assignNullable('zip', 'zip');
    assignNullable('country', 'country');
    assignNullable('taxId', 'taxId');
    assignNullable('taxNumber', 'taxNumber');
    assignNullable('vatId', 'vatId');
    assignNullable('invoicePrefix', 'invoicePrefix');
    assignNullable('invoiceEmail', 'invoiceEmail');
    assignNullable('bankName', 'bankName');
    assignNullable('iban', 'iban');
    assignNullable('bic', 'bic');
    assignNullable('pdfFooterText', 'pdfFooterText');
    assignNullable('emailSignature', 'emailSignature');
    assignNullable('phone', 'phone');
    assignNullable('email', 'email');
    assignNullable('managerName', 'managerName');
    assignNullable('managerEmail', 'managerEmail');
    assignNullable('accentColor', 'accentColor');
    assignNullable('logoDarkUrl', 'logoDarkUrl');
    assignNullable('pdfLogoUrl', 'pdfLogoUrl');
    assignNullable('logoUrl', 'logoUrl');
    assignNullable('language', 'language');

    if (dto.isSmallBusiness !== undefined) {
      data.isSmallBusiness = dto.isSmallBusiness;
    }
    if (dto.defaultVatRate !== undefined) {
      data.defaultVatRate = dto.defaultVatRate;
    }
    if (dto.nextInvoiceNumber !== undefined) {
      data.nextInvoiceNumber = dto.nextInvoiceNumber;
    }
    if (dto.paymentTermsDays !== undefined) {
      data.paymentTermsDays = dto.paymentTermsDays;
    }

    if (dto.website !== undefined) {
      try {
        data.website = normalizeWebsite(dto.website);
      } catch {
        throw new BadRequestException('Invalid website URL');
      }
    }

    if (dto.timezone !== undefined) {
      try {
        data.timezone = normalizeTimezoneInput(dto.timezone);
      } catch {
        throw new BadRequestException('Invalid IANA timezone');
      }
    }

    if (Object.keys(data).length === 0) {
      return before;
    }

    await this.prisma.organization.update({ where: { id: orgId }, data });
    const after = await this.getTenantProfile(orgId);

    if (auditCtx?.actorUserId) {
      const changed = collectChangedFields(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
        Object.keys(dto),
      );
      const critical = changed.filter((f) =>
        (TENANT_PROFILE_CRITICAL_FIELDS as readonly string[]).includes(f),
      );
      if (changed.length > 0) {
        void this.audit.record({
          actorUserId: auditCtx.actorUserId,
          actorOrganizationId: orgId,
          action: ActivityAction.UPDATE,
          entity: ActivityEntity.ORGANIZATION,
          entityId: orgId,
          description: 'Tenant company profile updated',
          changeSummary: changed.join(', '),
          route: auditCtx.route,
          ipAddress: auditCtx.ip,
          userAgent: auditCtx.userAgent,
          level: critical.length > 0 ? 'WARN' : 'INFO',
          metaJson: { changedFields: changed, criticalFields: critical },
        });
      }
    }

    return after;
  }

  async getOrganizationStats(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const [
      derivedFleetCounts,
      totalBookings,
      activeBookings,
      completedBookings,
      subscriptions,
    ] = await Promise.all([
      this.vehiclesService.aggregateDerivedFleetStatusCounts(orgId),
      this.prisma.booking.count({ where: { organizationId: orgId } }),
      this.prisma.booking.count({
        where: { organizationId: orgId, status: BookingStatus.ACTIVE },
      }),
      this.prisma.booking.count({
        where: { organizationId: orgId, status: BookingStatus.COMPLETED },
      }),
      this.prisma.billingSubscription.findMany({
        where: { organizationId: orgId, status: BillingStatus.ACTIVE },
        include: {
          invoices: {
            orderBy: { invoiceDate: 'desc' },
            take: 1,
            select: { amountCents: true },
          },
        },
      }),
    ]);

    const mrr = subscriptions.reduce((sum, sub) => {
      const latest = sub.invoices[0];
      return sum + (latest ? latest.amountCents / 100 : 0);
    }, 0);

    return {
      vehicles: {
        total: derivedFleetCounts.total,
        available: derivedFleetCounts.available,
        rented: derivedFleetCounts.rented,
        inService: derivedFleetCounts.maintenance,
        outOfService: 0,
        reserved: derivedFleetCounts.reserved,
        unknown: derivedFleetCounts.unknown,
        source: 'derived_fleet_status' as const,
      },
      bookings: {
        total: totalBookings,
        active: activeBookings,
        completed: completedBookings,
      },
      revenue: { mrr },
    };
  }

  private mapOrganization(org: any) {
    const fleetSize = org.vehicles?.length ?? 0;

    const hasDetailedMemberships =
      org.memberships?.length > 0 && 'status' in (org.memberships[0] || {});
    const userCount = hasDetailedMemberships
      ? org.memberships.filter((m: any) => m.status === 'ACTIVE').length
      : (org.memberships?.length ?? 0);

    const activeProducts = (org.organizationProducts || []).filter(
      (op: any) => op.status === 'ACTIVE' || op.status === 'TRIAL',
    );
    const highestPlan = activeProducts
      .map((op: any) => op.plan as string)
      .sort(
        (a: string, b: string) =>
          (PLAN_PRIORITY[b] || 0) - (PLAN_PRIORITY[a] || 0),
      )[0];

    const activeSubs = (org.subscriptions || []).filter(
      (s: any) => s.status === 'ACTIVE' || s.status === 'TRIALING',
    );
    const mrr = activeSubs.reduce((sum: number, sub: any) => {
      const latest = sub.invoices?.[0];
      return sum + (latest ? latest.amountCents / 100 : 0);
    }, 0);

    const products = (org.organizationProducts || []).map((op: any) => ({
      id: op.id,
      name: op.product?.name || op.productId,
      status: PRODUCT_STATUS_MAP[op.status] || 'Inactive',
      plan: PLAN_MAP[op.plan] || 'Starter',
    }));

    const integrations = (org.orgIntegrations || []).map((oi: any) => ({
      id: oi.id,
      name: oi.integration?.name || oi.integrationId,
      status: INTEGRATION_STATUS_MAP[oi.status] || 'Disconnected',
      lastSync: oi.lastSyncAt?.toISOString() || null,
    }));

    const invoices = (org.subscriptions || []).flatMap((sub: any) =>
      (sub.invoices || []).map((inv: any) => ({
        id: inv.id,
        amount: inv.amountCents / 100,
        status: INVOICE_STATUS_MAP[inv.status] || 'Pending',
        date: inv.invoiceDate?.toISOString() || inv.createdAt?.toISOString(),
        plan: PLAN_MAP[highestPlan] || 'Starter',
      })),
    );

    return {
      id: org.id,
      company_name: org.companyName,
      short_code: org.shortCode || null,
      business_type: BUSINESS_TYPE_MAP[org.businessType] || org.businessType,
      city: org.city || '',
      country: org.country || '',
      fleet_size: fleetSize,
      created_at: org.createdAt.toISOString(),
      status: ORG_STATUS_MAP[org.status] || 'Active',
      plan: PLAN_MAP[highestPlan] || 'Starter',
      mrr,
      users: userCount,
      contactEmail: org.email || '',
      lastActive:
        org.lastActiveAt?.toISOString() || org.updatedAt?.toISOString() || '',
      products,
      integrations,
      invoices,
    };
  }
}
