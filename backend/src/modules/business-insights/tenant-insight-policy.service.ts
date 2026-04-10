import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InsightType } from '@prisma/client';
import { TenantPolicy, DEFAULT_POLICY, PolicyUpdatePayload } from './insight.types';

@Injectable()
export class TenantInsightPolicyService {
  private readonly logger = new Logger(TenantInsightPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPolicy(organizationId: string): Promise<TenantPolicy> {
    const row = await this.prisma.tenantInsightPolicy.findUnique({
      where: { organizationId },
    });

    if (!row) return { ...DEFAULT_POLICY };

    const overrides = (row.policyOverrides ?? {}) as Record<string, any>;
    const enabledTypes = Array.isArray(row.enabledTypes)
      ? (row.enabledTypes as string[]).filter((t) => Object.values(InsightType).includes(t as InsightType)) as InsightType[]
      : DEFAULT_POLICY.enabledTypes;

    return {
      enabled: row.enabled,
      refreshIntervalMin: row.refreshIntervalMin,
      maxVisibleInsights: row.maxVisibleInsights,
      enabledTypes,
      handoverBufferMin: overrides.handoverBufferMin ?? DEFAULT_POLICY.handoverBufferMin,
      lowUtilizationDays: overrides.lowUtilizationDays ?? DEFAULT_POLICY.lowUtilizationDays,
      stationShortageThreshold: overrides.stationShortageThreshold ?? DEFAULT_POLICY.stationShortageThreshold,
      serviceWindowMinHours: overrides.serviceWindowMinHours ?? DEFAULT_POLICY.serviceWindowMinHours,
      serviceBeforeBookingHours: overrides.serviceBeforeBookingHours ?? DEFAULT_POLICY.serviceBeforeBookingHours,
      useLlmFormatting: row.useLlmFormatting,
    };
  }

  async updatePolicy(organizationId: string, payload: PolicyUpdatePayload): Promise<TenantPolicy> {
    const data: any = {};

    if (payload.enabled !== undefined) data.enabled = payload.enabled;
    if (payload.refreshIntervalMin !== undefined) data.refreshIntervalMin = payload.refreshIntervalMin;
    if (payload.maxVisibleInsights !== undefined) data.maxVisibleInsights = payload.maxVisibleInsights;
    if (payload.enabledTypes !== undefined) data.enabledTypes = payload.enabledTypes;
    if (payload.useLlmFormatting !== undefined) data.useLlmFormatting = payload.useLlmFormatting;
    if (payload.policyOverrides !== undefined) data.policyOverrides = payload.policyOverrides;

    await this.prisma.tenantInsightPolicy.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...data },
    });

    this.logger.log(`Policy updated for org ${organizationId}: ${JSON.stringify(payload)}`);
    return this.getPolicy(organizationId);
  }
}
