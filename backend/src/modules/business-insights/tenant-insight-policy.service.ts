import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InsightType } from '@prisma/client';
import { TenantPolicy, DEFAULT_POLICY, PolicyUpdatePayload } from './insight.types';
import { EvaluationsAuditService } from './access/evaluations-audit.service';
import type { EvaluationsAuditActor } from './access/evaluations-audit.service';

@Injectable()
export class TenantInsightPolicyService {
  private readonly logger = new Logger(TenantInsightPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationsAudit: EvaluationsAuditService,
  ) {}

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

  async updatePolicy(
    organizationId: string,
    payload: PolicyUpdatePayload,
    audit?: { actor: EvaluationsAuditActor; entityId?: string },
  ): Promise<TenantPolicy> {
    const before = await this.getPolicy(organizationId);
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
    const after = await this.getPolicy(organizationId);

    if (audit?.actor) {
      const thresholdKeys = payload.policyOverrides
        ? Object.keys(payload.policyOverrides).filter((key) =>
            [
              'stationShortageThreshold',
              'lowUtilizationDays',
              'handoverBufferMin',
              'serviceWindowMinHours',
              'serviceBeforeBookingHours',
            ].includes(key),
          )
        : [];

      void this.evaluationsAudit.recordKpiDefinitionChange(organizationId, audit.actor, {
        entityId: audit.entityId ?? `insight-policy:${organizationId}`,
        changeSummary: 'Tenant insight / KPI policy updated',
        before: {
          enabled: before.enabled,
          maxVisibleInsights: before.maxVisibleInsights,
          enabledTypesCount: before.enabledTypes.length,
          stationShortageThreshold: before.stationShortageThreshold,
          lowUtilizationDays: before.lowUtilizationDays,
        },
        after: {
          enabled: after.enabled,
          maxVisibleInsights: after.maxVisibleInsights,
          enabledTypesCount: after.enabledTypes.length,
          stationShortageThreshold: after.stationShortageThreshold,
          lowUtilizationDays: after.lowUtilizationDays,
        },
        thresholdKeys,
      });
    }

    return after;
  }
}
