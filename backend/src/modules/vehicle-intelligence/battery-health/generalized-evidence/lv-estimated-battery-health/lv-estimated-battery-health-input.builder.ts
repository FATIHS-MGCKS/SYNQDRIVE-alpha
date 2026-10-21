import type { PrismaService } from '@shared/database/prisma.service';
import type { LvMeasuredIntelligenceReadService } from '../lv-measured-intelligence/lv-measured-intelligence-read.service';
import { buildLvOperationalConditionInputV1 } from '../lv-operational-condition/lv-operational-condition-input.builder';
import { LV_ESTIMATED_HEALTH_DEFAULT_RESTORE_CUTOFF_ISO } from './lv-estimated-battery-health-v1.constants';
import type { LvEstimatedBatteryHealthInputV1 } from './lv-estimated-battery-health-v1.types';

export async function buildLvEstimatedBatteryHealthInputV1(
  deps: {
    prisma: PrismaService;
    readModel: LvMeasuredIntelligenceReadService;
  },
  input: {
    organizationId: string;
    vehicleId: string;
    measuredFrom?: Date;
    measuredTo?: Date;
    observationLimit?: number;
    sessionLimit?: number;
    restoreCutoffIso?: string;
  },
): Promise<LvEstimatedBatteryHealthInputV1> {
  const restoreCutoffIso = input.restoreCutoffIso ?? LV_ESTIMATED_HEALTH_DEFAULT_RESTORE_CUTOFF_ISO;
  const restoreCutoff = new Date(restoreCutoffIso);

  const conditionInput = await buildLvOperationalConditionInputV1(deps, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    measuredFrom: input.measuredFrom,
    measuredTo: input.measuredTo,
    observationLimit: input.observationLimit,
    sessionLimit: input.sessionLimit,
  });

  const postRestoreObservationCount = await deps.prisma.batteryGeneralizedEvidenceObservation.count({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      voltageObservedAt: { gte: restoreCutoff },
    },
  });

  return {
    conditionInput,
    restoreCutoffIso,
    postRestoreObservationCount,
  };
}
