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

const FETCH_OUTCOMES_LOADED = [...FETCH_OUTCOMES_FOR_ADVANCE, 'PERSISTENCE_FAILED'] as const;

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
    const continuityBlockers: string[] = [];

    const counter = await this.prisma.vehicleProviderSourceObservationCounter.findUnique({
      where: {
        organizationId_vehicleId_provider_providerBindingScopeKey_providerTokenScopeKey: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider: input.provider,
          providerBindingScopeKey: input.providerBindingScopeKey,
          providerTokenScopeKey: input.providerTokenScopeKey,
        },
      },
      select: { nextObservationIndex: true },
    });

    const fetchRows = await this.prisma.vehicleProviderSourceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        providerBindingScopeKey: input.providerBindingScopeKey,
        providerTokenScopeKey: input.providerTokenScopeKey,
        recordPhase: 'PROVIDER_FETCH',
        observationOutcome: { in: [...FETCH_OUTCOMES_LOADED] },
      },
      orderBy: [{ observationIndex: 'desc' }],
      take: 50,
      select: observationSelect,
    });

    const headRow = fetchRows[0] as VsiSourceObservationRow | undefined;

    let allocatedHead: bigint | null = null;
    if (counter) {
      allocatedHead = counter.nextObservationIndex - 1n;
      if (allocatedHead >= 1n) {
        const headPersisted = await this.prisma.vehicleProviderSourceObservation.count({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            provider: input.provider,
            providerBindingScopeKey: input.providerBindingScopeKey,
            providerTokenScopeKey: input.providerTokenScopeKey,
            recordPhase: 'PROVIDER_FETCH',
            observationIndex: allocatedHead,
          },
        });
        if (headPersisted === 0) {
          continuityBlockers.push('COUNTER_ALLOCATED_HEAD_MISSING_OBSERVATION');
        }
      }
    }

    if (headRow?.observationOutcome === 'PERSISTENCE_FAILED') {
      continuityBlockers.push('NEWEST_FETCH_OBSERVATION_PERSISTENCE_FAILED');
    }

    if (
      headRow &&
      allocatedHead != null &&
      headRow.observationIndex < allocatedHead &&
      !continuityBlockers.includes('COUNTER_ALLOCATED_HEAD_MISSING_OBSERVATION')
    ) {
      continuityBlockers.push('COUNTER_ALLOCATED_HEAD_MISSING_OBSERVATION');
    }

    const maySelectSuccessfulPair =
      continuityBlockers.length === 0 &&
      headRow != null &&
      FETCH_OUTCOMES_FOR_ADVANCE.includes(
        headRow.observationOutcome as (typeof FETCH_OUTCOMES_FOR_ADVANCE)[number],
      );

    let latestSuccessful: VsiSourceObservationRow | null = null;
    let previousSuccessful: VsiSourceObservationRow | null = null;

    if (maySelectSuccessfulPair) {
      latestSuccessful = headRow;
      previousSuccessful =
        (fetchRows.find(
          (r) =>
            FETCH_OUTCOMES_FOR_ADVANCE.includes(
              r.observationOutcome as (typeof FETCH_OUTCOMES_FOR_ADVANCE)[number],
            ) &&
            r.observationIndex < latestSuccessful!.observationIndex,
        ) as VsiSourceObservationRow | undefined) ?? null;
    }

    const continuityIntact =
      continuityBlockers.length === 0 &&
      latestSuccessful != null &&
      previousSuccessful != null &&
      (await this.isPairContinuityIntact(input, previousSuccessful.observationIndex, latestSuccessful.observationIndex));

    const latestVlsApplicationProven =
      latestSuccessful != null
        ? await this.isVlsApplicationProven(
            latestSuccessful.fetchCorrelationId,
            latestSuccessful.observationOutcome,
          )
        : false;

    return {
      latest: latestSuccessful,
      previous: previousSuccessful,
      continuityIntact,
      latestVlsApplicationProven,
      continuityBlockers,
      counterAllocatedHead: allocatedHead,
    };
  }

  private async isPairContinuityIntact(
    input: {
      organizationId: string;
      vehicleId: string;
      provider: string;
      providerBindingScopeKey: string;
      providerTokenScopeKey: string;
    },
    previousIndex: bigint,
    latestIndex: bigint,
  ): Promise<boolean> {
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
