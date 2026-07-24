import { Injectable } from '@nestjs/common';
import { ProviderAccessGrantStatus } from '@prisma/client';
import { evaluateProviderGrantConsolidation } from './provider-grant-consolidation.evaluator';
import type {
  ProviderGrantConsolidationInput,
  ProviderGrantConsolidationResult,
} from './provider-grant-consolidation.types';

@Injectable()
export class ProviderGrantConsolidationService {
  evaluate(input: ProviderGrantConsolidationInput): ProviderGrantConsolidationResult {
    return evaluateProviderGrantConsolidation(input);
  }

  isGrantActiveForVehicle(
    grants: Array<{ providerStatus: ProviderAccessGrantStatus; vehicleId: string | null }>,
    vehicleId: string,
  ): boolean {
    return grants.some(
      (g) =>
        g.providerStatus === ProviderAccessGrantStatus.ACTIVE &&
        g.vehicleId === vehicleId,
    );
  }
}
