import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  aggregateHvShadowMetrics,
  aggregateLvShadowMetrics,
  sampleVehicleShadowSummaries,
} from './battery-shadow-validation.aggregator';
import {
  evaluateShadowValidationGates,
  resolveObservationPeriod,
  resolveOverallRecommendation,
  snapshotShadowValidationFlags,
  summarizeGateResults,
} from './battery-shadow-validation.policy';
import {
  BATTERY_SHADOW_VALIDATION_DISCLAIMER,
  BATTERY_SHADOW_VALIDATION_SCRIPT_VERSION,
  type BatteryShadowValidationReport,
  type BatteryShadowValidationRunOptions,
} from './battery-shadow-validation.types';

@Injectable()
export class BatteryShadowValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async runReport(options: BatteryShadowValidationRunOptions = {}): Promise<BatteryShadowValidationReport> {
    const referenceNow = options.referenceNow ?? new Date();
    const observationPeriod = resolveObservationPeriod({
      referenceNow,
      observationStartAt: options.observationStartAt,
      observationDays: options.observationDays,
    });

    const startAt = new Date(observationPeriod.startAt);
    const endAt = new Date(observationPeriod.endAt);

    const scope = {
      organizationId: options.organizationId,
      vehicleId: options.vehicleId,
      startAt,
      endAt,
    };

    const [lv, hv, organization, vehiclesInScope] = await Promise.all([
      aggregateLvShadowMetrics(this.prisma, scope),
      aggregateHvShadowMetrics(this.prisma, scope),
      options.organizationId
        ? this.prisma.organization.findUnique({
            where: { id: options.organizationId },
            select: { companyName: true },
          })
        : Promise.resolve(null),
      this.prisma.vehicle.count({
        where: {
          ...(options.organizationId ? { organizationId: options.organizationId } : {}),
          ...(options.vehicleId ? { id: options.vehicleId } : {}),
        },
      }),
    ]);

    const flags = snapshotShadowValidationFlags();
    const gates = evaluateShadowValidationGates({ observationPeriod, flags, lv, hv });
    const summary = summarizeGateResults(gates);
    const overallRecommendation = resolveOverallRecommendation({ observationPeriod, gates });

    const includeSamples = options.includeVehicleSamples !== false;
    const vehicleSamples = includeSamples
      ? await sampleVehicleShadowSummaries(this.prisma, {
          ...scope,
          limit: options.vehicleSampleLimit ?? 10,
        })
      : [];

    return {
      mode: 'shadow_validation',
      scriptVersion: BATTERY_SHADOW_VALIDATION_SCRIPT_VERSION,
      readOnly: true,
      publicationBlocked: true,
      readinessBlocked: true,
      disclaimer: BATTERY_SHADOW_VALIDATION_DISCLAIMER,
      generatedAt: referenceNow.toISOString(),
      observationPeriod,
      organizationId: options.organizationId ?? null,
      organizationName: organization?.companyName ?? null,
      vehiclesInScope,
      vehicleSamples,
      flags,
      lv,
      hv,
      gates,
      overallRecommendation,
      summary,
    };
  }
}
