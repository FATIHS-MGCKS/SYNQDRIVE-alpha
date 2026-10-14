import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type {
  VsiFetchObservationContinuity,
  VsiSourceObservationRow,
} from './vsi-strict-source-advance.types';

const FETCH_OUTCOMES_FOR_ADVANCE = [
  'PROVIDER_FETCH_RECORDED',
  'MONOTONIC_STALE_SKIPPED',
] as const;

@Injectable()
export class VsiProviderSourceObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadFetchObservationContinuity(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    providerBindingScopeKey: string;
    providerTokenScopeKey: string;
  }): Promise<VsiFetchObservationContinuity> {
    const fetchRows = await this.prisma.vehicleProviderSourceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        providerBindingScopeKey: input.providerBindingScopeKey,
        providerTokenScopeKey: input.providerTokenScopeKey,
        recordPhase: 'PROVIDER_FETCH',
        observationOutcome: { in: [...FETCH_OUTCOMES_FOR_ADVANCE, 'PERSISTENCE_FAILED'] },
      },
      orderBy: [{ observationIndex: 'desc' }],
      take: 50,
      select: observationSelect,
    });

    const latestSuccessful = fetchRows.find((r) =>
      FETCH_OUTCOMES_FOR_ADVANCE.includes(
        r.observationOutcome as (typeof FETCH_OUTCOMES_FOR_ADVANCE)[number],
      ),
    ) as VsiSourceObservationRow | undefined;

    if (!latestSuccessful) {
      return {
        latest: null,
        previous: null,
        continuityIntact: false,
        latestVlsApplicationProven: false,
      };
    }

    const previousSuccessful = fetchRows.find(
      (r) =>
        FETCH_OUTCOMES_FOR_ADVANCE.includes(
          r.observationOutcome as (typeof FETCH_OUTCOMES_FOR_ADVANCE)[number],
        ) && r.observationIndex < latestSuccessful.observationIndex,
    ) as VsiSourceObservationRow | undefined;

    const continuityIntact = await this.isContinuityIntact(
      input,
      previousSuccessful?.observationIndex ?? null,
      latestSuccessful.observationIndex,
    );

    const latestVlsApplicationProven = await this.isVlsApplicationProven(
      latestSuccessful.fetchCorrelationId,
      latestSuccessful.observationOutcome,
    );

    return {
      latest: latestSuccessful,
      previous: previousSuccessful ?? null,
      continuityIntact,
      latestVlsApplicationProven,
    };
  }

  private async isContinuityIntact(
    input: {
      organizationId: string;
      vehicleId: string;
      provider: string;
      providerBindingScopeKey: string;
      providerTokenScopeKey: string;
    },
    previousIndex: bigint | null,
    latestIndex: bigint,
  ): Promise<boolean> {
    if (previousIndex == null) {
      return false;
    }
    if (latestIndex - previousIndex !== 1n) {
      return false;
    }
    const betweenCount = await this.prisma.vehicleProviderSourceObservation.count({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        providerBindingScopeKey: input.providerBindingScopeKey,
        providerTokenScopeKey: input.providerTokenScopeKey,
        observationIndex: { gt: previousIndex, lt: latestIndex },
      },
    });
    if (betweenCount > 0) {
      return false;
    }
    const failedAtOrAfterPrevious = await this.prisma.vehicleProviderSourceObservation.count({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        providerBindingScopeKey: input.providerBindingScopeKey,
        providerTokenScopeKey: input.providerTokenScopeKey,
        recordPhase: 'PROVIDER_FETCH',
        observationOutcome: 'PERSISTENCE_FAILED',
        observationIndex: { gte: previousIndex, lte: latestIndex },
      },
    });
    return failedAtOrAfterPrevious === 0;
  }

  private async isVlsApplicationProven(
    fetchCorrelationId: string | null,
    fetchOutcome: string,
  ): Promise<boolean> {
    if (fetchOutcome === 'MONOTONIC_STALE_SKIPPED') {
      return true;
    }
    if (!fetchCorrelationId) {
      return false;
    }
    const application = await this.prisma.vehicleProviderSourceObservation.findFirst({
      where: {
        fetchCorrelationId,
        recordPhase: 'VLS_APPLICATION',
        observationOutcome: 'VLS_COMMITTED',
      },
      select: { id: true },
    });
    return application != null;
  }
}

const observationSelect = {
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
  recordPhase: true,
  fetchCorrelationId: true,
};
