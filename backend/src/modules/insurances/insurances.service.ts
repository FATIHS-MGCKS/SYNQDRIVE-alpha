import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { EmailChannelAdapter } from './adapters/email-channel.adapter';
import { ApiChannelAdapter } from './adapters/api-channel.adapter';
import type {
  InsurerChannelAdapter,
  InsurerInquiryPayload,
} from './adapters/insurer-channel.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class InsurancesService {
  private readonly logger = new Logger(InsurancesService.name);
  private readonly channels: Map<string, InsurerChannelAdapter> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailChannel: EmailChannelAdapter,
    private readonly apiChannel: ApiChannelAdapter,
  ) {
    this.channels.set('EMAIL', emailChannel);
    this.channels.set('API', apiChannel);
  }

  private getChannel(type: string): InsurerChannelAdapter {
    const ch = this.channels.get(type);
    if (!ch) throw new BadRequestException(`Unsupported channel: ${type}`);
    return ch;
  }

  // ─── Admin: Partner CRUD ───────────────────────────────────

  async listPartners() {
    return this.prisma.insurancePartner.findMany({
      orderBy: { rankingWeight: 'desc' },
      include: { contacts: true },
    });
  }

  async getPartner(id: string) {
    const p = await this.prisma.insurancePartner.findUnique({
      where: { id },
      include: { contacts: true },
    });
    if (!p) throw new NotFoundException('Insurance partner not found');
    return p;
  }

  async createPartner(data: any) {
    return this.prisma.insurancePartner.create({ data });
  }

  async updatePartner(id: string, data: Record<string, unknown>) {
    await this.getPartner(id);
    const { id: _, createdAt: __, ...rest } = data;
    return this.prisma.insurancePartner.update({ where: { id }, data: rest as any });
  }

  async testPartnerConnection(id: string) {
    const partner = await this.getPartner(id);
    const channel = this.getChannel(partner.communicationChannel);
    const config = (partner.configJson as Record<string, unknown>) ?? {};
    const primary = partner.contacts.find((c: any) => c.isPrimary);
    if (primary?.email) config.contactEmail = primary.email;

    const result = await channel.testConnection(config);
    await this.prisma.insurancePartner.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        healthStatus: result.success ? 'HEALTHY' : 'DOWN',
        ...(result.success
          ? { lastSuccessAt: new Date(), lastFailureReason: null }
          : { lastFailureAt: new Date(), lastFailureReason: result.message }),
      },
    });
    return result;
  }

  // ─── Admin: Contact CRUD ───────────────────────────────────

  async listContacts(partnerId?: string) {
    return this.prisma.insurancePartnerContact.findMany({
      where: partnerId ? { insurancePartnerId: partnerId } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async createContact(data: any) {
    return this.prisma.insurancePartnerContact.create({ data });
  }

  async updateContact(id: string, data: any) {
    return this.prisma.insurancePartnerContact.update({ where: { id }, data });
  }

  // ─── Admin: Templates ──────────────────────────────────────

  async listDisclosureTemplates(filters?: { insurerKey?: string; isActive?: boolean }) {
    const where: any = {};
    if (filters?.insurerKey) where.insurerKey = filters.insurerKey;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    return this.prisma.insuranceDisclosureTemplate.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createDisclosureTemplate(data: any) {
    const latest = await this.prisma.insuranceDisclosureTemplate.findFirst({
      where: { insurerKey: data.insurerKey ?? null },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return this.prisma.insuranceDisclosureTemplate.create({
      data: { ...data, version: (latest?.version ?? 0) + 1 },
    });
  }

  async updateDisclosureTemplate(id: string, data: any) {
    return this.prisma.insuranceDisclosureTemplate.update({ where: { id }, data });
  }

  async listInquiryTemplates(filters?: { insurerKey?: string; inquiryType?: string }) {
    const where: any = {};
    if (filters?.insurerKey) where.insurerKey = filters.insurerKey;
    if (filters?.inquiryType) where.inquiryType = filters.inquiryType;
    return this.prisma.insuranceInquiryTemplate.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createInquiryTemplate(data: any) {
    const latest = await this.prisma.insuranceInquiryTemplate.findFirst({
      where: { insurerKey: data.insurerKey ?? null, inquiryType: data.inquiryType ?? null },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return this.prisma.insuranceInquiryTemplate.create({
      data: { ...data, version: (latest?.version ?? 0) + 1 },
    });
  }

  async updateInquiryTemplate(id: string, data: any) {
    return this.prisma.insuranceInquiryTemplate.update({ where: { id }, data });
  }

  // ─── Org: Enabled Partners ─────────────────────────────────

  async listEnabledPartners(organizationId: string) {
    const partners = await this.prisma.insurancePartner.findMany({
      where: { isEnabled: true },
      orderBy: { rankingWeight: 'desc' },
      include: { contacts: { where: { isPrimary: true }, take: 1 } },
    });
    const orgAccess = await this.prisma.insurancePartnerOrgAccess.findMany({
      where: { organizationId },
    });
    const blockedIds = new Set(
      orgAccess.filter((a) => !a.isEnabled).map((a) => a.insurancePartnerId),
    );
    return partners
      .filter((p) => !blockedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        key: p.key,
        displayName: p.displayName,
        description: p.description,
        supportedInquiryTypes: p.supportedInquiryTypes,
        supportedInsuranceModels: p.supportedInsuranceModels,
        acceptedHistoricalData: p.acceptedHistoricalData,
        acceptedLiveData: p.acceptedLiveData,
        communicationChannel: p.communicationChannel,
        healthStatus: p.healthStatus,
        slaInfo: p.slaInfo,
        supportsDynamicInsurance: p.supportsDynamicInsurance,
        supportsUsageBased: p.supportsUsageBased,
        supportsKilometerBased: p.supportsKilometerBased,
        supportsDrivingScoreBased: p.supportsDrivingScoreBased,
        primaryContact: p.contacts[0]?.fullName ?? null,
      }));
  }

  // ─── Org: Fleet Insurance Overview ─────────────────────────

  async getFleetInsuranceOverview(organizationId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: {
        id: true, make: true, model: true, year: true, vin: true,
        licensePlate: true, fuelType: true, imageUrl: true, mileageKm: true,
      },
    });

    const records = await this.prisma.vehicleInsuranceRecord.findMany({
      where: { organizationId },
    });

    const pendingInquiries = await this.prisma.insuranceInquiry.findMany({
      where: { organizationId, status: { in: ['SUBMITTED', 'AWAITING_RESPONSE', 'PARTIALLY_SENT'] } },
      select: { vehicleId: true, status: true },
    });

    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const recordMap = new Map<string, typeof records[0]>();
    for (const r of records) {
      const existing = recordMap.get(r.vehicleId);
      if (!existing || (r.validUntil && existing.validUntil && r.validUntil > existing.validUntil)) {
        recordMap.set(r.vehicleId, r);
      }
    }

    const pendingMap = new Set(pendingInquiries.map((i) => i.vehicleId));

    const fleetInsurance = vehicles.map((v) => {
      const record = recordMap.get(v.id);
      let status: string = 'MISSING';
      if (record) {
        if (record.validUntil && record.validUntil < now) status = 'EXPIRED';
        else if (record.validUntil && record.validUntil < soonThreshold) status = 'EXPIRING_SOON';
        else status = 'ACTIVE';
      } else if (pendingMap.has(v.id)) {
        status = 'PENDING_INQUIRY';
      }

      return {
        vehicle: v,
        insurance: record ?? null,
        status,
        hasPendingInquiry: pendingMap.has(v.id),
      };
    });

    const summary = {
      total: vehicles.length,
      insured: fleetInsurance.filter((f) => f.status === 'ACTIVE').length,
      expiringSoon: fleetInsurance.filter((f) => f.status === 'EXPIRING_SOON').length,
      expired: fleetInsurance.filter((f) => f.status === 'EXPIRED').length,
      missing: fleetInsurance.filter((f) => f.status === 'MISSING').length,
      pendingInquiry: fleetInsurance.filter((f) => f.hasPendingInquiry).length,
    };

    return { vehicles: fleetInsurance, summary };
  }

  async getVehicleInsurance(vehicleId: string, organizationId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true, make: true, model: true, year: true, vin: true,
        licensePlate: true, fuelType: true, imageUrl: true, mileageKm: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const records = await this.prisma.vehicleInsuranceRecord.findMany({
      where: { vehicleId, organizationId },
      orderBy: { validFrom: 'desc' },
    });

    const inquiries = await this.prisma.insuranceInquiry.findMany({
      where: { vehicleId, organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { recipients: { include: { insurer: { select: { displayName: true } } } } },
    });

    const liveSharingPerms = await this.prisma.insuranceLiveSharingPermission.findMany({
      where: { vehicleId, organizationId, status: 'ACTIVE' },
      include: { insurer: { select: { displayName: true, key: true } } },
    });

    return { vehicle, records, inquiries, liveSharingPermissions: liveSharingPerms };
  }

  // ─── Org: Inquiry Submission ───────────────────────────────

  async submitInquiry(params: {
    organizationId: string;
    userId: string;
    vehicleId: string;
    inquiryType: string;
    selectedInsurerIds: string[];
    selectedHistoricalData: Record<string, unknown>;
    selectedLiveData: Record<string, unknown>;
    selectedTimeRange: { from: string; to: string; label?: string };
    selectedInsuranceModels: string[];
    ipAddress?: string;
    userAgent?: string;
  }) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: params.vehicleId, organizationId: params.organizationId },
      select: {
        id: true, make: true, model: true, year: true, vin: true,
        licensePlate: true, fuelType: true, mileageKm: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const insurers = await this.prisma.insurancePartner.findMany({
      where: { id: { in: params.selectedInsurerIds }, isEnabled: true },
      include: { contacts: { where: { isPrimary: true }, take: 1 } },
    });
    if (!insurers.length) throw new BadRequestException('No valid insurers selected');

    const correlationId = randomUUID();

    const disclosure = await this.prisma.insuranceDisclosureTemplate.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });

    const inquiry = await this.prisma.insuranceInquiry.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        vehicleId: params.vehicleId,
        inquiryType: params.inquiryType,
        selectedHistoricalData: params.selectedHistoricalData as any,
        selectedLiveData: params.selectedLiveData as any,
        selectedTimeRange: params.selectedTimeRange as any,
        selectedInsuranceModels: params.selectedInsuranceModels,
        reviewSnapshotJson: {
          vehicle: { make: vehicle.make, model: vehicle.model, year: vehicle.year, vin: vehicle.vin },
          insurerCount: insurers.length,
          inquiryType: params.inquiryType,
          models: params.selectedInsuranceModels,
        },
        status: 'SUBMITTED',
        correlationId,
      },
    });

    const template = await this.prisma.insuranceInquiryTemplate.findFirst({
      where: { isActive: true, inquiryType: params.inquiryType },
      orderBy: { version: 'desc' },
    });

    const recipientResults: any[] = [];

    for (const insurer of insurers) {
      await this.prisma.insuranceDataAuthorizationLog.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          vehicleId: params.vehicleId,
          insurerId: insurer.id,
          inquiryId: inquiry.id,
          disclosedHistoricalData: params.selectedHistoricalData as any,
          authorizedLiveData: params.selectedLiveData as any,
          selectedTimeRange: params.selectedTimeRange as any,
          purpose: params.inquiryType,
          noticeVersion: disclosure?.version ?? 1,
          noticeTitleSnapshot: disclosure?.title ?? 'Data Sharing Authorization',
          noticeBodySnapshot: disclosure?.body ?? '',
          confirmedAt: new Date(),
          correlationId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          transmissionChannel: insurer.communicationChannel,
        },
      });

      const channel = this.getChannel(insurer.communicationChannel);
      const config = (insurer.configJson as Record<string, unknown>) ?? {};
      const primary = insurer.contacts[0];
      if (primary?.email) config.contactEmail = primary.email;

      const subject = template?.subjectTemplate
        ? this.renderTemplate(template.subjectTemplate, vehicle, params)
        : `Insurance Inquiry: ${vehicle.make} ${vehicle.model} ${vehicle.year}`;
      const body = template?.bodyTemplate
        ? this.renderTemplate(template.bodyTemplate, vehicle, params)
        : `Inquiry for ${vehicle.make} ${vehicle.model} ${vehicle.year} (${params.inquiryType})`;

      const payload: InsurerInquiryPayload = {
        inquiryId: inquiry.id,
        correlationId,
        vehicleSummary: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin ?? undefined,
          licensePlate: vehicle.licensePlate ?? undefined,
          fuelType: vehicle.fuelType ?? undefined,
          mileageKm: vehicle.mileageKm ?? undefined,
        },
        inquiryType: params.inquiryType,
        selectedInsuranceModels: params.selectedInsuranceModels,
        historicalDataSummary: params.selectedHistoricalData,
        liveDataScope: params.selectedLiveData,
        timeRange: params.selectedTimeRange,
        subject,
        body,
      };

      const result = await channel.sendInquiry(payload, config);

      const recipient = await this.prisma.insuranceInquiryRecipient.create({
        data: {
          inquiryId: inquiry.id,
          insurerId: insurer.id,
          channelType: insurer.communicationChannel,
          deliveryStatus: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? result.sentAt : null,
          failureReason: result.success ? null : result.message,
          externalReference: result.externalReference,
          payloadSnapshotJson: payload as any,
        },
      });

      recipientResults.push({
        insurerId: insurer.id,
        insurerName: insurer.displayName,
        success: result.success,
        message: result.message,
      });

      if (params.selectedLiveData && Object.keys(params.selectedLiveData).length > 0) {
        await this.prisma.insuranceLiveSharingPermission.create({
          data: {
            organizationId: params.organizationId,
            vehicleId: params.vehicleId,
            insurerId: insurer.id,
            inquiryId: inquiry.id,
            enabledDataCategories: params.selectedLiveData as any,
            reportingFrequency: (params.selectedLiveData as any).reportingFrequency ?? 'MONTHLY',
            status: 'ACTIVE',
            validFrom: new Date(),
            createdBy: params.userId,
          },
        });
      }
    }

    const allSent = recipientResults.every((r) => r.success);
    const noneSent = recipientResults.every((r) => !r.success);
    await this.prisma.insuranceInquiry.update({
      where: { id: inquiry.id },
      data: {
        status: allSent ? 'AWAITING_RESPONSE' : noneSent ? 'FAILED' : 'PARTIALLY_SENT',
      },
    });

    return { inquiryId: inquiry.id, correlationId, recipients: recipientResults };
  }

  private renderTemplate(tmpl: string, vehicle: any, params: any): string {
    return tmpl
      .replace(/\{\{make\}\}/g, vehicle.make ?? '')
      .replace(/\{\{model\}\}/g, vehicle.model ?? '')
      .replace(/\{\{year\}\}/g, String(vehicle.year ?? ''))
      .replace(/\{\{vin\}\}/g, vehicle.vin ?? '')
      .replace(/\{\{licensePlate\}\}/g, vehicle.licensePlate ?? '')
      .replace(/\{\{inquiryType\}\}/g, params.inquiryType ?? '')
      .replace(/\{\{insuranceModels\}\}/g, (params.selectedInsuranceModels ?? []).join(', '));
  }

  // ─── Org: Inquiry History ──────────────────────────────────

  async listInquiries(filters: {
    organizationId?: string;
    vehicleId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.status) where.status = filters.status;

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const [rows, total] = await Promise.all([
      this.prisma.insuranceInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { recipients: { include: { insurer: { select: { displayName: true, key: true } } } } },
      }),
      this.prisma.insuranceInquiry.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  async getInquiry(id: string, organizationId?: string) {
    const where: any = { id };
    if (organizationId) where.organizationId = organizationId;
    const inquiry = await this.prisma.insuranceInquiry.findFirst({
      where,
      include: {
        recipients: { include: { insurer: { select: { displayName: true, key: true } } } },
      },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    return inquiry;
  }

  // ─── Org: Live Sharing ─────────────────────────────────────

  async listLiveSharingPermissions(filters: {
    organizationId?: string;
    vehicleId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.status) where.status = filters.status;
    return this.prisma.insuranceLiveSharingPermission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { insurer: { select: { displayName: true, key: true } } },
    });
  }

  async updateLiveSharing(id: string, data: { status?: string; revokedBy?: string; revokeReason?: string }) {
    const perm = await this.prisma.insuranceLiveSharingPermission.findUnique({ where: { id } });
    if (!perm) throw new NotFoundException('Live sharing permission not found');

    const updateData: any = {};
    if (data.status === 'REVOKED') {
      updateData.status = 'REVOKED';
      updateData.revokedAt = new Date();
      updateData.revokedBy = data.revokedBy;
      updateData.revokeReason = data.revokeReason;
    } else if (data.status) {
      updateData.status = data.status;
    }
    return this.prisma.insuranceLiveSharingPermission.update({ where: { id }, data: updateData });
  }

  // ─── Org: Missing Docs ─────────────────────────────────────

  async getMissingInsuranceDocs(organizationId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: { id: true, make: true, model: true, year: true, licensePlate: true },
    });
    const records = await this.prisma.vehicleInsuranceRecord.findMany({
      where: { organizationId, status: { not: 'MISSING' } },
      select: { vehicleId: true },
    });
    const coveredIds = new Set(records.map((r) => r.vehicleId));
    return vehicles.filter((v) => !coveredIds.has(v.id));
  }

  // ─── Admin: Authorization Log ──────────────────────────────

  async getAuthorizationLogs(filters: {
    organizationId?: string;
    userId?: string;
    vehicleId?: string;
    insurerId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.insurerId) where.insurerId = filters.insurerId;
    if (filters.from || filters.to) {
      where.confirmedAt = {};
      if (filters.from) where.confirmedAt.gte = filters.from;
      if (filters.to) where.confirmedAt.lte = filters.to;
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const [rows, total] = await Promise.all([
      this.prisma.insuranceDataAuthorizationLog.findMany({
        where,
        orderBy: { confirmedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { insurer: { select: { displayName: true, key: true } } },
      }),
      this.prisma.insuranceDataAuthorizationLog.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  // ─── Admin: Health Overview ────────────────────────────────

  async getHealthOverview() {
    const partners = await this.prisma.insurancePartner.findMany();
    const totalInquiries = await this.prisma.insuranceInquiry.count();
    const recentFailures = await this.prisma.insuranceInquiryRecipient.count({
      where: { deliveryStatus: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const activeLiveSharing = await this.prisma.insuranceLiveSharingPermission.count({
      where: { status: 'ACTIVE' },
    });

    return {
      totalPartners: partners.length,
      activePartners: partners.filter((p) => p.isEnabled).length,
      healthyPartners: partners.filter((p) => p.healthStatus === 'HEALTHY').length,
      degradedPartners: partners.filter((p) => p.healthStatus === 'DEGRADED').length,
      downPartners: partners.filter((p) => p.healthStatus === 'DOWN').length,
      totalInquiries,
      recentFailures24h: recentFailures,
      activeLiveSharingPermissions: activeLiveSharing,
      partners: partners.map((p) => ({
        id: p.id,
        key: p.key,
        displayName: p.displayName,
        isEnabled: p.isEnabled,
        healthStatus: p.healthStatus,
        communicationChannel: p.communicationChannel,
        lastTestedAt: p.lastTestedAt,
        lastSuccessAt: p.lastSuccessAt,
        lastFailureAt: p.lastFailureAt,
        lastFailureReason: p.lastFailureReason,
        supportsDynamicInsurance: p.supportsDynamicInsurance,
      })),
    };
  }

  // ─── Active Disclosure ─────────────────────────────────────

  async getActiveDisclosure(insurerKey?: string, inquiryType?: string) {
    return this.prisma.insuranceDisclosureTemplate.findFirst({
      where: {
        isActive: true,
        OR: [
          { insurerKey: insurerKey ?? null, inquiryType: inquiryType ?? null },
          { insurerKey: null, inquiryType: null },
        ],
      },
      orderBy: [{ insurerKey: 'desc' }, { version: 'desc' }],
    });
  }
}
