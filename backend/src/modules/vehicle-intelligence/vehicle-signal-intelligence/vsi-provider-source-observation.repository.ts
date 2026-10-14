import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { VsiSourceObservationRow } from './vsi-strict-source-advance.types';

const MAX_OBSERVATION_ROWS = 2;

@Injectable()
export class VsiProviderSourceObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadLatestTwoForScope(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    providerBindingScopeKey: string;
    providerTokenScopeKey: string;
  }): Promise<VsiSourceObservationRow[]> {
    const rows = await this.prisma.vehicleProviderSourceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        providerBindingScopeKey: input.providerBindingScopeKey,
        providerTokenScopeKey: input.providerTokenScopeKey,
      },
      orderBy: [{ observationIndex: 'desc' }],
      take: MAX_OBSERVATION_ROWS,
      select: {
        organizationId: true,
        vehicleId: true,
        provider: true,
        providerBindingId: true,
        providerBindingScopeKey: true,
        providerTokenReference: true,
        providerTokenScopeKey: true,
        observationIndex: true,
        providerFetchedAt: true,
        providerSourceTimestamp: true,
        observationOutcome: true,
      },
    });
    return rows;
  }
}
