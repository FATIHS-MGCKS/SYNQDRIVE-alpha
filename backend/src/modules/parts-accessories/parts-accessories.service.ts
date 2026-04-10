import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { AlzuraAdapter } from './providers/alzura.adapter';
import { EbayAdapter } from './providers/ebay.adapter';
import {
  PartsProviderAdapter,
  VehicleFitmentContext,
  ProductSearchRequest,
  ProductSearchResponse,
  ProductDetailResult,
  ProviderCapabilities,
  DisclosureFieldSet,
} from './providers/provider-adapter.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class PartsAccessoriesService {
  private readonly logger = new Logger(PartsAccessoriesService.name);
  private readonly adapters: Map<string, PartsProviderAdapter> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly alzura: AlzuraAdapter,
    private readonly ebay: EbayAdapter,
  ) {
    this.adapters.set(alzura.providerKey, alzura);
    this.adapters.set(ebay.providerKey, ebay);
  }

  private getAdapter(key: string): PartsProviderAdapter {
    const adapter = this.adapters.get(key);
    if (!adapter) throw new BadRequestException(`Unknown provider: ${key}`);
    return adapter;
  }

  // ─── Provider Management (Master Admin) ────────────────────

  async listProviders() {
    return this.prisma.partsProvider.findMany({ orderBy: { rankingWeight: 'desc' } });
  }

  async getProvider(id: string) {
    const p = await this.prisma.partsProvider.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Provider not found');
    return p;
  }

  async createProvider(data: {
    key: string;
    displayName: string;
    description?: string;
    integrationType: any;
    supportedCategories: any[];
    configJson?: any;
    capabilitiesJson?: any;
  }) {
    return this.prisma.partsProvider.create({ data: data as any });
  }

  async updateProvider(id: string, data: Record<string, unknown>) {
    await this.getProvider(id);
    const { id: _, createdAt: __, ...updateData } = data;
    return this.prisma.partsProvider.update({ where: { id }, data: updateData as any });
  }

  async testProviderConnection(id: string) {
    const provider = await this.getProvider(id);
    const adapter = this.getAdapter(provider.key);
    const result = await adapter.testConnection();

    await this.prisma.partsProvider.update({
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

  // ─── Org-Facing Provider Listing ───────────────────────────

  async listEnabledProviders(organizationId: string) {
    const providers = await this.prisma.partsProvider.findMany({
      where: { isEnabled: true },
      orderBy: { rankingWeight: 'desc' },
    });

    const orgAccess = await this.prisma.partsProviderOrgAccess.findMany({
      where: { organizationId },
    });
    const blockedIds = new Set(
      orgAccess.filter((a) => !a.isEnabled).map((a) => a.providerId),
    );

    return providers
      .filter((p) => !blockedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        key: p.key,
        displayName: p.displayName,
        description: p.description,
        integrationType: p.integrationType,
        supportedCategories: p.supportedCategories,
        healthStatus: p.healthStatus,
        capabilities: this.getProviderCapabilities(p.key),
      }));
  }

  getProviderCapabilities(key: string): ProviderCapabilities | null {
    try {
      return this.getAdapter(key).getCapabilities();
    } catch {
      return null;
    }
  }

  // ─── Disclosure Templates ──────────────────────────────────

  async listDisclosures(filters?: { providerKey?: string; isActive?: boolean }) {
    const where: any = {};
    if (filters?.providerKey) where.providerKey = filters.providerKey;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    return this.prisma.partsDisclosureTemplate.findMany({ where, orderBy: { version: 'desc' } });
  }

  async createDisclosure(data: {
    providerKey?: string;
    category?: string;
    title: string;
    body: string;
    createdById?: string;
  }) {
    const latestVersion = await this.prisma.partsDisclosureTemplate.findFirst({
      where: { providerKey: data.providerKey ?? null },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return this.prisma.partsDisclosureTemplate.create({
      data: {
        providerKey: data.providerKey,
        category: data.category as any,
        title: data.title,
        body: data.body,
        version: (latestVersion?.version ?? 0) + 1,
        createdById: data.createdById,
      },
    });
  }

  async updateDisclosure(id: string, data: Record<string, unknown>) {
    return this.prisma.partsDisclosureTemplate.update({ where: { id }, data: data as any });
  }

  async getActiveDisclosure(providerKey: string, category?: string) {
    const disclosure = await this.prisma.partsDisclosureTemplate.findFirst({
      where: {
        isActive: true,
        OR: [
          { providerKey, category: category as any },
          { providerKey, category: null },
          { providerKey: null, category: null },
        ],
      },
      orderBy: [{ providerKey: 'desc' }, { category: 'desc' }, { version: 'desc' }],
    });
    return disclosure;
  }

  // ─── Vehicle Fitment Context Builder ───────────────────────

  async buildFitmentContext(vehicleId: string, organizationId: string): Promise<VehicleFitmentContext> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      include: { tireSetups: { where: { status: 'ACTIVE' }, take: 1 } },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found in your organization');

    const tireSetup = vehicle.tireSetups?.[0];

    return {
      vehicleId: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      fuelType: vehicle.fuelType ?? undefined,
      bodyType: vehicle.vehicleType ?? undefined,
      vin: vehicle.vin ?? undefined,
      tireFrontSpec: tireSetup?.frontDimension ?? undefined,
      tireRearSpec: tireSetup?.rearDimension ?? undefined,
      driveType: vehicle.driveType ?? undefined,
      curbWeightKg: vehicle.curbWeightKg ?? undefined,
    };
  }

  // ─── Data Authorization / Disclosure Confirmation ──────────

  async confirmDisclosure(params: {
    organizationId: string;
    userId: string;
    vehicleId: string;
    providerKey: string;
    category: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }) {
    const provider = await this.prisma.partsProvider.findUnique({ where: { key: params.providerKey } });
    if (!provider) throw new BadRequestException('Provider not found');

    const disclosure = await this.getActiveDisclosure(params.providerKey, params.category);
    if (!disclosure) throw new BadRequestException('No active disclosure template found');

    const adapter = this.getAdapter(params.providerKey);
    const disclosedFields = adapter.getDisclosureFields(params.category);
    const correlationId = randomUUID();

    const log = await this.prisma.partsAuthorizationLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        vehicleId: params.vehicleId,
        providerKey: params.providerKey,
        providerDisplayName: provider.displayName,
        category: params.category,
        disclosedFieldsJson: disclosedFields as any,
        noticeVersion: disclosure.version,
        noticeTitleSnapshot: disclosure.title,
        noticeBodySnapshot: disclosure.body,
        confirmedAt: new Date(),
        correlationId,
        sessionId: params.sessionId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });

    return { correlationId, authorizationLogId: log.id };
  }

  // ─── Search ────────────────────────────────────────────────

  async searchProducts(params: {
    organizationId: string;
    userId: string;
    vehicleId: string;
    providerKey: string;
    category: 'TIRES' | 'PARTS' | 'ACCESSORIES';
    correlationId: string;
    query?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    filters?: Record<string, string | string[]>;
  }): Promise<ProductSearchResponse> {
    const fitment = await this.buildFitmentContext(params.vehicleId, params.organizationId);
    const adapter = this.getAdapter(params.providerKey);

    const request: ProductSearchRequest = {
      fitment,
      category: params.category,
      query: params.query,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      sortBy: params.sortBy as any,
      filters: params.filters,
    };

    const searchRecord = await this.prisma.partsSearchRequest.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        vehicleId: params.vehicleId,
        providerKey: params.providerKey,
        category: params.category,
        correlationId: params.correlationId,
        normalizedRequestJson: request as any,
        status: 'PENDING',
      },
    });

    const start = Date.now();
    try {
      const response = await adapter.searchProducts(request);
      const durationMs = Date.now() - start;

      await this.prisma.partsSearchRequest.update({
        where: { id: searchRecord.id },
        data: {
          status: 'SUCCESS',
          durationMs,
          resultCount: response.totalCount,
          responseSummaryJson: {
            totalCount: response.totalCount,
            returnedCount: response.results.length,
            page: response.page,
          },
        },
      });

      await this.prisma.partsAuthorizationLog.updateMany({
        where: { correlationId: params.correlationId },
        data: { executionStatus: 'SUCCESS' },
      });

      return response;
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);

      await this.prisma.partsSearchRequest.update({
        where: { id: searchRecord.id },
        data: { status: 'FAILURE', durationMs },
      });

      await this.prisma.partsAuthorizationLog.updateMany({
        where: { correlationId: params.correlationId },
        data: { executionStatus: 'FAILURE', executionFailureReason: message },
      });

      this.logger.error(`Search failed for ${params.providerKey}: ${message}`);
      throw err;
    }
  }

  async getProductDetail(providerKey: string, externalId: string, vehicleId?: string, organizationId?: string): Promise<ProductDetailResult | null> {
    const adapter = this.getAdapter(providerKey);
    let fitment: VehicleFitmentContext | undefined;
    if (vehicleId && organizationId) {
      fitment = await this.buildFitmentContext(vehicleId, organizationId);
    }
    return adapter.getProduct(externalId, fitment);
  }

  // ─── Authorization Log Queries ─────────────────────────────

  async getAuthorizationLogs(filters: {
    organizationId?: string;
    userId?: string;
    vehicleId?: string;
    providerKey?: string;
    category?: string;
    executionStatus?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.providerKey) where.providerKey = filters.providerKey;
    if (filters.category) where.category = filters.category;
    if (filters.executionStatus) where.executionStatus = filters.executionStatus;
    if (filters.from || filters.to) {
      where.confirmedAt = {};
      if (filters.from) where.confirmedAt.gte = filters.from;
      if (filters.to) where.confirmedAt.lte = filters.to;
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const [rows, total] = await Promise.all([
      this.prisma.partsAuthorizationLog.findMany({
        where,
        orderBy: { confirmedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.partsAuthorizationLog.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  }

  // ─── Health / Stats (Master Admin) ─────────────────────────

  async getHealthOverview() {
    const providers = await this.prisma.partsProvider.findMany();
    const totalLogs = await this.prisma.partsAuthorizationLog.count();
    const recentErrors = await this.prisma.partsSearchRequest.count({
      where: { status: 'FAILURE', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    return {
      totalProviders: providers.length,
      activeProviders: providers.filter((p) => p.isEnabled).length,
      healthyProviders: providers.filter((p) => p.healthStatus === 'HEALTHY').length,
      degradedProviders: providers.filter((p) => p.healthStatus === 'DEGRADED').length,
      downProviders: providers.filter((p) => p.healthStatus === 'DOWN').length,
      totalAuthorizations: totalLogs,
      recentErrors24h: recentErrors,
      providers: providers.map((p) => ({
        id: p.id,
        key: p.key,
        displayName: p.displayName,
        isEnabled: p.isEnabled,
        healthStatus: p.healthStatus,
        lastTestedAt: p.lastTestedAt,
        lastSuccessAt: p.lastSuccessAt,
        lastFailureAt: p.lastFailureAt,
        lastFailureReason: p.lastFailureReason,
      })),
    };
  }

  // ─── Disclosure Fields Helper ──────────────────────────────

  getDisclosureFields(providerKey: string, category: string): DisclosureFieldSet | null {
    try {
      const adapter = this.getAdapter(providerKey);
      return adapter.getDisclosureFields(category);
    } catch {
      return null;
    }
  }
}
