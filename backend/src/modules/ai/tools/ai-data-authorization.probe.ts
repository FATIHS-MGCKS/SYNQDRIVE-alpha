import { Injectable } from '@nestjs/common';
import { DataAuthorizationEnforcementService } from '@modules/data-authorizations/data-authorization-enforcement.service';
import type { AiDataAuthorizationProbe } from '../execution/ai-execution-context.types';

@Injectable()
export class AiDataAuthorizationProbeAdapter implements AiDataAuthorizationProbe {
  constructor(
    private readonly enforcement: DataAuthorizationEnforcementService,
  ) {}

  async isGpsLocationAuthorized(params: {
    organizationId: string;
    vehicleId: string;
    purpose: string;
  }): Promise<boolean> {
    return this.enforcement.isAuthorized({
      orgId: params.organizationId,
      vehicleId: params.vehicleId,
      sourceType: 'DIMO',
      dataCategory: 'GPS_LOCATION',
      purpose: params.purpose === 'fleet_assistant_query' ? 'LIVE_MAP' : params.purpose,
      processorType: 'SYNQDRIVE',
    });
  }
}
