import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildLvEstimatedBatteryHealthInputV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-input.builder';
import { evaluateLvEstimatedBatteryHealthV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.evaluator';
import { LvMeasuredIntelligenceReadService } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-measured-intelligence/lv-measured-intelligence-read.service';
import {
  LV_GE_ASSESSMENT_MAX_ROWS,
  LV_MEASURED_INTELLIGENCE_ASSESSMENT_SESSION_LIMIT,
  LV_MEASURED_INTELLIGENCE_MAX_HISTORICAL_RANGE_DAYS,
} from '../vehicle-intelligence/battery-health/generalized-evidence/lv-measured-intelligence/lv-measured-intelligence.constants';
import type { LvEstimatedBatteryHealthShadowAdminV1 } from './battery-v2-lv-estimated-health-shadow.admin.types';

@Injectable()
export class BatteryV2LvEstimatedHealthShadowAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readModel: LvMeasuredIntelligenceReadService,
  ) {}

  async evaluateVehicleShadowAssessment(input: {
    organizationId: string;
    vehicleId: string;
    measuredFrom?: Date;
    measuredTo?: Date;
  }): Promise<LvEstimatedBatteryHealthShadowAdminV1> {
    const measuredTo = input.measuredTo ?? new Date();
    const measuredFrom =
      input.measuredFrom ??
      new Date(
        measuredTo.getTime() - LV_MEASURED_INTELLIGENCE_MAX_HISTORICAL_RANGE_DAYS * 24 * 60 * 60 * 1000,
      );

    if (measuredFrom.getTime() > measuredTo.getTime()) {
      throw new BadRequestException('measuredFrom must be <= measuredTo');
    }
    const maxSpanMs = LV_MEASURED_INTELLIGENCE_MAX_HISTORICAL_RANGE_DAYS * 24 * 60 * 60 * 1000;
    if (measuredTo.getTime() - measuredFrom.getTime() > maxSpanMs) {
      throw new BadRequestException('measured date range exceeds maximum span');
    }

    await this.readModel.assertVehicleInOrganization(input.organizationId, input.vehicleId);

    const healthInput = await buildLvEstimatedBatteryHealthInputV1(
      { prisma: this.prisma, readModel: this.readModel },
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        measuredFrom,
        measuredTo,
        sessionLimit: LV_MEASURED_INTELLIGENCE_ASSESSMENT_SESSION_LIMIT,
        assessmentMaxGeRows: LV_GE_ASSESSMENT_MAX_ROWS,
      },
    );

    const assessment = evaluateLvEstimatedBatteryHealthV1(healthInput);
    const condition = healthInput.conditionInput;

    return {
      shadowContractVersion: 'LV_ESTIMATED_BATTERY_HEALTH_SHADOW_ADMIN_V1',
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      evaluatedAtIso: assessment.evaluatedAtIso,
      measuredIntelligenceBoundaryNote: 'MEASURED_INTELLIGENCE_NOT_ASSESSED_IS_NOT_N16_RESULT',
      dataSelection: {
        ...condition.geDataSelection,
        historicalObservationsTruncated: condition.historicalObservationsTruncated,
        inputCoverageIncomplete: condition.inputCoverageIncomplete,
        historicalQueryMode: condition.historicalQueryMode,
      },
      assessment,
    };
  }
}
