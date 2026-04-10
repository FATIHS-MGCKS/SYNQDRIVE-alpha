import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ServicePartnerProvider,
  ServicePartnerGlobalStatus,
  PartnerAssignmentStatus,
  PartnerAssignmentMode,
  PartnerDataAuthStatus,
  ServiceCaseStatus,
  ServiceCaseType,
} from '@prisma/client';

const EUROMASTER_DEFAULT_CAPABILITIES = [
  'tire_service',
  'tire_inspection',
  'tire_replacement',
  'wheel_alignment',
  'brake_inspection',
  'oil_change',
  'general_maintenance',
  'fleet_service',
  'mobile_service',
];

const ADAC_DEFAULT_CAPABILITIES = [
  'breakdown_assistance',
  'roadside_assistance',
  'towing',
  'vehicle_inspection',
  'driving_safety_training',
];

const EUROMASTER_DATA_SCOPES = [
  'vehicle_identity.read',
  'vehicle_plate.read',
  'vehicle_vin.read',
  'vehicle_mileage.read',
  'vehicle_tire_data.read',
  'vehicle_health_data.read',
  'service_request.write',
  'service_request.read',
  'appointment.write',
  'appointment.read',
  'contact_person.read',
];

const ADAC_DATA_SCOPES = [
  'vehicle_identity.read',
  'vehicle_plate.read',
  'vehicle_vin.read',
  'vehicle_location.read',
  'incident.write',
  'contact_person.read',
];

@Injectable()
export class ServicePartnersService {
  private readonly logger = new Logger(ServicePartnersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureSeedPartners(): Promise<void> {
    const existing = await this.prisma.servicePartner.findMany();
    if (existing.some((p) => p.provider === 'EUROMASTER') && existing.some((p) => p.provider === 'ADAC')) return;

    if (!existing.some((p) => p.provider === 'EUROMASTER')) {
      await this.prisma.servicePartner.create({
        data: {
          provider: 'EUROMASTER',
          name: 'Euromaster',
          category: 'SERVICE_MAINTENANCE',
          globalStatus: 'ACTIVE',
          description: 'Tire service, maintenance, and fleet care partner',
          websiteUrl: 'https://www.euromaster.de',
          capabilities: EUROMASTER_DEFAULT_CAPABILITIES,
          configSchema: {
            fields: [
              { key: 'apiKey', label: 'API Key', type: 'secret', required: true },
              { key: 'customerId', label: 'Customer ID', type: 'string', required: true },
              { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'production'], required: true },
            ],
          },
        },
      });
      this.logger.log('Seeded Euromaster service partner');
    }

    if (!existing.some((p) => p.provider === 'ADAC')) {
      await this.prisma.servicePartner.create({
        data: {
          provider: 'ADAC',
          name: 'ADAC',
          category: 'SERVICE_MAINTENANCE',
          globalStatus: 'PREPARED',
          description: 'Roadside assistance and vehicle inspection partner',
          websiteUrl: 'https://www.adac.de',
          capabilities: ADAC_DEFAULT_CAPABILITIES,
          configSchema: {
            fields: [
              { key: 'memberNumber', label: 'ADAC Member Number', type: 'string', required: true },
              { key: 'apiKey', label: 'API Key', type: 'secret', required: false },
              { key: 'contractId', label: 'Fleet Contract ID', type: 'string', required: false },
            ],
          },
        },
      });
      this.logger.log('Seeded ADAC service partner');
    }
  }

  // ---- Partner CRUD ----

  async findAllPartners() {
    const partners = await this.prisma.servicePartner.findMany({
      include: { assignments: { select: { id: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return partners.map((p) => ({
      id: p.id,
      provider: p.provider,
      name: p.name,
      category: p.category,
      globalStatus: p.globalStatus,
      description: p.description,
      logoUrl: p.logoUrl,
      websiteUrl: p.websiteUrl,
      capabilities: p.capabilities ?? [],
      connectedOrgsCount: p.assignments.filter((a) => a.status === 'ACTIVE').length,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async getPartnerById(id: string) {
    return this.prisma.servicePartner.findUnique({ where: { id } });
  }

  async findPartnerByProvider(provider: ServicePartnerProvider) {
    const p = await this.prisma.servicePartner.findUnique({ where: { provider } });
    if (!p) throw new NotFoundException(`Partner ${provider} not found`);
    return p;
  }

  async updatePartner(provider: ServicePartnerProvider, data: { globalStatus?: ServicePartnerGlobalStatus; apiBaseUrl?: string; description?: string }) {
    await this.findPartnerByProvider(provider);
    return this.prisma.servicePartner.update({ where: { provider }, data });
  }

  // ---- Org Assignment ----

  async getAssignmentsForOrg(orgId: string) {
    const rows = await this.prisma.tenantServicePartnerAssignment.findMany({
      where: { organizationId: orgId },
      include: { partner: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => ({
      id: a.id,
      partnerId: a.partnerId,
      provider: a.partner.provider,
      partnerName: a.partner.name,
      globalStatus: a.partner.globalStatus,
      status: a.status,
      mode: a.mode,
      enabledFeatures: a.enabledFeatures ?? [],
      connectedAt: a.connectedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async assignPartnerToOrg(orgId: string, partnerId: string, mode: PartnerAssignmentMode = 'MANUAL_ONLY') {
    const partner = await this.prisma.servicePartner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner not found');

    return this.prisma.tenantServicePartnerAssignment.upsert({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
      create: {
        organizationId: orgId,
        partnerId,
        status: 'ACTIVE',
        mode,
        connectedAt: new Date(),
      },
      update: {
        status: 'ACTIVE',
        mode,
        connectedAt: new Date(),
      },
    });
  }

  async updateAssignment(orgId: string, partnerId: string, data: { status?: PartnerAssignmentStatus; mode?: PartnerAssignmentMode; enabledFeatures?: string[]; configJson?: Record<string, unknown>; credentials?: Record<string, unknown> }) {
    const existing = await this.prisma.tenantServicePartnerAssignment.findUnique({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    return this.prisma.tenantServicePartnerAssignment.update({
      where: { id: existing.id },
      data: {
        ...data,
        enabledFeatures: data.enabledFeatures ? (data.enabledFeatures as any) : undefined,
        configJson: data.configJson ? (data.configJson as any) : undefined,
        credentials: data.credentials ? (data.credentials as any) : undefined,
      },
    });
  }

  async removeAssignment(orgId: string, partnerId: string) {
    const existing = await this.prisma.tenantServicePartnerAssignment.findUnique({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    return this.prisma.tenantServicePartnerAssignment.update({
      where: { id: existing.id },
      data: { status: 'INACTIVE' },
    });
  }

  // ---- Data Authorization ----

  async getDataAuth(orgId: string, partnerId: string) {
    return this.prisma.partnerDataAuthorization.findUnique({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
    });
  }

  async grantDataAuth(orgId: string, partnerId: string, scopes: string[], grantedBy: string, notes?: string) {
    return this.prisma.partnerDataAuthorization.upsert({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
      create: {
        organizationId: orgId,
        partnerId,
        status: 'GRANTED',
        grantedScopes: scopes,
        grantedBy,
        grantedAt: new Date(),
        notes,
      },
      update: {
        status: 'GRANTED',
        grantedScopes: scopes,
        grantedBy,
        grantedAt: new Date(),
        revokedAt: null,
        notes,
      },
    });
  }

  async revokeDataAuth(orgId: string, partnerId: string) {
    const existing = await this.prisma.partnerDataAuthorization.findUnique({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
    });
    if (!existing) throw new NotFoundException('Data authorization not found');
    return this.prisma.partnerDataAuthorization.update({
      where: { id: existing.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  getDefaultScopes(provider: ServicePartnerProvider): string[] {
    return provider === 'EUROMASTER' ? EUROMASTER_DATA_SCOPES : ADAC_DATA_SCOPES;
  }

  // ---- Service Cases ----

  async createServiceCase(orgId: string, data: {
    partnerId: string;
    vehicleId?: string;
    type: ServiceCaseType;
    title: string;
    description?: string;
    scheduledAt?: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
  }) {
    const partner = await this.prisma.servicePartner.findUnique({ where: { id: data.partnerId } });
    if (!partner) throw new NotFoundException('Partner not found');

    const assignment = await this.prisma.tenantServicePartnerAssignment.findUnique({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId: data.partnerId } },
    });
    if (!assignment || assignment.status !== 'ACTIVE') {
      throw new BadRequestException('Partner not assigned/active for this organization');
    }

    const sc = await this.prisma.partnerServiceCase.create({
      data: {
        organizationId: orgId,
        partnerId: data.partnerId,
        vehicleId: data.vehicleId,
        type: data.type,
        status: 'DRAFT',
        title: data.title,
        description: data.description,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        createdBy: data.createdBy,
        metadata: data.metadata ? (data.metadata as any) : undefined,
      },
    });

    await this.prisma.partnerServiceCaseEvent.create({
      data: { caseId: sc.id, type: 'CREATED', payload: { by: data.createdBy } },
    });

    return sc;
  }

  async getServiceCases(orgId: string, filters?: { partnerId?: string; vehicleId?: string; status?: ServiceCaseStatus }) {
    const where: any = { organizationId: orgId };
    if (filters?.partnerId) where.partnerId = filters.partnerId;
    if (filters?.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters?.status) where.status = filters.status;

    return this.prisma.partnerServiceCase.findMany({
      where,
      include: { partner: { select: { provider: true, name: true } }, vehicle: { select: { id: true, licensePlate: true, make: true, model: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getServiceCaseById(orgId: string, caseId: string) {
    const sc = await this.prisma.partnerServiceCase.findFirst({
      where: { id: caseId, organizationId: orgId },
      include: {
        partner: { select: { provider: true, name: true } },
        vehicle: { select: { id: true, licensePlate: true, make: true, model: true } },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!sc) throw new NotFoundException('Service case not found');
    return sc;
  }

  async updateServiceCaseStatus(orgId: string, caseId: string, status: ServiceCaseStatus, note?: string) {
    const sc = await this.prisma.partnerServiceCase.findFirst({ where: { id: caseId, organizationId: orgId } });
    if (!sc) throw new NotFoundException('Service case not found');

    const updated = await this.prisma.partnerServiceCase.update({
      where: { id: caseId },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
    });

    await this.prisma.partnerServiceCaseEvent.create({
      data: { caseId, type: 'STATUS_CHANGED', payload: { from: sc.status, to: status, note } },
    });

    return updated;
  }

  // ---- Admin: All assignments across tenants ----

  async getAllAssignments() {
    const rows = await this.prisma.tenantServicePartnerAssignment.findMany({
      include: {
        partner: { select: { provider: true, name: true } },
        organization: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      orgName: a.organization.companyName,
      partnerId: a.partnerId,
      provider: a.partner.provider,
      partnerName: a.partner.name,
      status: a.status,
      mode: a.mode,
      connectedAt: a.connectedAt?.toISOString() ?? null,
    }));
  }

  async getAllDataAuthorizations() {
    const rows = await this.prisma.partnerDataAuthorization.findMany({
      include: {
        partner: { select: { provider: true, name: true } },
        organization: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      orgName: a.organization.companyName,
      partnerId: a.partnerId,
      provider: a.partner.provider,
      partnerName: a.partner.name,
      status: a.status,
      grantedScopes: a.grantedScopes,
      grantedBy: a.grantedBy,
      grantedAt: a.grantedAt?.toISOString() ?? null,
      revokedAt: a.revokedAt?.toISOString() ?? null,
    }));
  }

  async getAdminStats() {
    const [totalPartners, activeAssignments, grantedAuths, totalCases, activeCases] = await Promise.all([
      this.prisma.servicePartner.count(),
      this.prisma.tenantServicePartnerAssignment.count({ where: { status: 'ACTIVE' } }),
      this.prisma.partnerDataAuthorization.count({ where: { status: 'GRANTED' } }),
      this.prisma.partnerServiceCase.count(),
      this.prisma.partnerServiceCase.count({ where: { status: { in: ['DRAFT', 'REQUESTED', 'BOOKED', 'IN_PROGRESS'] } } }),
    ]);
    return { totalPartners, activeAssignments, grantedAuths, totalCases, activeCases };
  }

  async getRecentCasesAdmin(limit = 20) {
    return this.prisma.partnerServiceCase.findMany({
      include: {
        partner: { select: { provider: true, name: true } },
        organization: { select: { id: true, companyName: true } },
        vehicle: { select: { id: true, licensePlate: true, make: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ---- Admin: Partner detail with enriched data ----

  async getPartnerDetailAdmin(provider: ServicePartnerProvider) {
    const partner = await this.prisma.servicePartner.findUnique({
      where: { provider },
      include: {
        assignments: {
          include: { organization: { select: { id: true, companyName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!partner) throw new NotFoundException(`Partner ${provider} not found`);

    const auths = await this.prisma.partnerDataAuthorization.findMany({
      where: { partnerId: partner.id },
      include: { organization: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const caseStats = await this.prisma.partnerServiceCase.groupBy({
      by: ['status'],
      where: { partnerId: partner.id },
      _count: true,
    });

    const recentCases = await this.prisma.partnerServiceCase.findMany({
      where: { partnerId: partner.id },
      include: {
        organization: { select: { id: true, companyName: true } },
        vehicle: { select: { id: true, licensePlate: true, make: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const defaultScopes = this.getDefaultScopes(provider);

    return {
      id: partner.id,
      provider: partner.provider,
      name: partner.name,
      category: partner.category,
      globalStatus: partner.globalStatus,
      description: partner.description,
      websiteUrl: partner.websiteUrl,
      logoUrl: partner.logoUrl,
      capabilities: partner.capabilities ?? [],
      configSchema: partner.configSchema,
      createdAt: partner.createdAt.toISOString(),
      defaultScopes,
      assignments: partner.assignments.map((a) => ({
        id: a.id,
        organizationId: a.organizationId,
        orgName: a.organization.companyName,
        status: a.status,
        mode: a.mode,
        enabledFeatures: a.enabledFeatures ?? [],
        connectedAt: a.connectedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      authorizations: auths.map((auth) => {
        const granted = (auth.grantedScopes as string[]) ?? [];
        const missing = defaultScopes.filter((s) => !granted.includes(s));
        return {
          id: auth.id,
          organizationId: auth.organizationId,
          orgName: auth.organization.companyName,
          status: auth.status,
          grantedScopes: granted,
          missingScopes: missing,
          isComplete: missing.length === 0 && auth.status === 'GRANTED',
          grantedBy: auth.grantedBy,
          grantedAt: auth.grantedAt?.toISOString() ?? null,
          revokedAt: auth.revokedAt?.toISOString() ?? null,
          notes: auth.notes,
        };
      }),
      caseStats: caseStats.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {} as Record<string, number>),
      recentCases: recentCases.map((sc) => ({
        id: sc.id,
        title: sc.title,
        type: sc.type,
        status: sc.status,
        orgName: sc.organization.companyName,
        vehiclePlate: sc.vehicle?.licensePlate ?? null,
        createdAt: sc.createdAt.toISOString(),
      })),
    };
  }

  // ---- Admin: Grant/revoke data authorization ----

  async adminGrantDataAuth(
    orgId: string,
    partnerId: string,
    scopes: string[],
    grantedBy: string,
    notes?: string,
  ) {
    return this.grantDataAuth(orgId, partnerId, scopes, grantedBy, notes);
  }

  async adminRevokeDataAuth(orgId: string, partnerId: string) {
    return this.revokeDataAuth(orgId, partnerId);
  }

  // ---- Admin: Authorization completeness per partner ----

  async getAuthorizationSummaryAdmin(partnerId: string) {
    const partner = await this.prisma.servicePartner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner not found');

    const assignments = await this.prisma.tenantServicePartnerAssignment.findMany({
      where: { partnerId, status: 'ACTIVE' },
      include: { organization: { select: { id: true, companyName: true } } },
    });

    const auths = await this.prisma.partnerDataAuthorization.findMany({
      where: { partnerId },
      include: { organization: { select: { id: true, companyName: true } } },
    });

    const defaultScopes = this.getDefaultScopes(partner.provider);
    const authMap = new Map(auths.map((a) => [a.organizationId, a]));

    return assignments.map((a) => {
      const auth = authMap.get(a.organizationId);
      const granted = (auth?.grantedScopes as string[]) ?? [];
      const missing = defaultScopes.filter((s) => !granted.includes(s));
      const status = !auth ? 'NOT_CONFIGURED' : auth.status;
      return {
        organizationId: a.organizationId,
        orgName: a.organization.companyName,
        assignmentStatus: a.status,
        assignmentMode: a.mode,
        authStatus: status,
        grantedScopes: granted,
        missingScopes: missing,
        isComplete: status === 'GRANTED' && missing.length === 0,
        isBlocked: status !== 'GRANTED' || missing.length > 0,
        blockReason: status !== 'GRANTED'
          ? `Authorization ${status === 'NOT_CONFIGURED' ? 'not configured' : status.toLowerCase()}`
          : missing.length > 0
          ? `Missing ${missing.length} required scope${missing.length > 1 ? 's' : ''}`
          : null,
      };
    });
  }

  // ---- Admin: Update assignment from admin context ----

  async adminUpdateAssignment(
    orgId: string,
    partnerId: string,
    data: { status?: string; mode?: string; enabledFeatures?: string[] },
  ) {
    return this.updateAssignment(orgId, partnerId, data as any);
  }
}
