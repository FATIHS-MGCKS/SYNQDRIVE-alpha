import { Injectable } from '@nestjs/common';
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
  }): Promise<LvMeasuredIntelligenceV1> {
    return this.readModel.readVehicleIntelligence(input);
  }
}
