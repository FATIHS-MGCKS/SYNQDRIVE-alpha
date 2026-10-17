import { BadRequestException, Injectable } from '@nestjs/common';
import { LvMeasuredIntelligenceReadService } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-measured-intelligence/lv-measured-intelligence-read.service';
import type { LvMeasuredIntelligenceV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-measured-intelligence/lv-measured-intelligence.types';

@Injectable()
export class BatteryV2LvMeasuredIntelligenceAdminService {
  constructor(private readonly readModel: LvMeasuredIntelligenceReadService) {}

  async getVehicleMeasuredIntelligence(input: {
    organizationId: string;
    vehicleId: string;
    sessionLimit?: number;
    observationLimit?: number;
    measuredFrom?: Date;
    measuredTo?: Date;
  }): Promise<LvMeasuredIntelligenceV1> {
    if (
      (input.measuredFrom != null && input.measuredTo == null) ||
      (input.measuredFrom == null && input.measuredTo != null)
    ) {
      throw new BadRequestException('measuredFrom and measuredTo must both be provided for date-range browsing');
    }
    return this.readModel.readVehicleIntelligence(input);
  }
}
