import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseHfService, HF_TRIP_RPM_DEFAULT_READ_LIMIT } from '@modules/clickhouse/clickhouse-hf.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VsiCapabilityResolverRepository } from '../../vehicle-signal-intelligence/vsi-capability-resolver.repository';
import type { VsiActiveRpmProfileResolutionV1 } from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import { resolveIceRpmApplicability } from '../../vehicle-signal-intelligence/vsi-profile-cadence-stats.util';
import {
  resolveDs4RpmHfV1aAdmission,
  resolveTripRpmProfileFromVsi,
} from './ds4-rpm-hf-v1a-admission';
import type { Ds4RpmHfV1aTripInputV1 } from './ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from './ds4-rpm-hf-v1a.contract';
import { buildDs4RpmHfV1aDataQuality } from './ds4-rpm-hf-v1a-data-quality';
import { readEngineRpmCadenceFromSignalsSnapshot } from './ds4-rpm-hf-v1a-profile.reader';

export type Ds4RpmHfV1aBuildTripInputParams = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripStart: Date;
  tripEnd: Date;
  providerSourceLinkId?: string | null;
  fuelType?: string | null;
  readLimit?: number;
  readOffset?: number;
};

@Injectable()
export class Ds4RpmHfV1aTripInputService {
  private readonly logger = new Logger(Ds4RpmHfV1aTripInputService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vsiProfiles: VsiCapabilityResolverRepository,
    @Optional() private readonly clickHouseHf?: ClickHouseHfService,
  ) {}

  /**
   * Builds read-only RPM HF trip input for a future shadow engine (V1A).
   * Does not mutate trips, scores, or DS4 motion outputs.
   */
  async buildTripInput(
    params: Ds4RpmHfV1aBuildTripInputParams,
  ): Promise<Ds4RpmHfV1aTripInputV1> {
    const linkId =
      params.providerSourceLinkId ??
      (await this.resolveDimoSourceLinkId(params.vehicleId));

    const fuelType =
      params.fuelType ??
      (
        await this.prisma.vehicle.findFirst({
          where: { id: params.vehicleId, organizationId: params.organizationId },
          select: { fuelType: true },
        })
      )?.fuelType ??
      null;

    const iceRpmApplicability = resolveIceRpmApplicability(fuelType);

    let activeRpmProfileSnapshot: VsiActiveRpmProfileResolutionV1 | null = null;
    let tripRpmProfile = resolveTripRpmProfileFromVsi({
      tripId: params.tripId,
      tripClassifications: [],
    });
    let vehicleActiveRpmProfile: VsiActiveRpmProfileResolutionV1['activeProfile'] | null = null;

    if (linkId) {
      const profileCtx = await this.vsiProfiles.loadProfileContext({
        organizationId: params.organizationId,
        vehicleId: params.vehicleId,
        providerSourceLinkId: linkId,
      });
    if (profileCtx?.signals?.length) {
        const parsed = readEngineRpmCadenceFromSignalsSnapshot(profileCtx.signals);
        activeRpmProfileSnapshot = parsed.activeRpmProfile;
        vehicleActiveRpmProfile = parsed.activeRpmProfile?.activeProfile ?? null;
        tripRpmProfile = resolveTripRpmProfileFromVsi({
          tripId: params.tripId,
          tripClassifications: parsed.activeRpmProfile?.tripClassifications ?? [],
        });
      }
    }

    const readLimit = params.readLimit ?? HF_TRIP_RPM_DEFAULT_READ_LIMIT;
    const readOffset = params.readOffset ?? 0;

    let read = null;
    if (this.clickHouseHf) {
      read = await this.clickHouseHf.getTripRpmHfPoints({
        orgId: params.organizationId,
        vehicleId: params.vehicleId,
        tripId: params.tripId,
        tripStart: params.tripStart,
        tripEnd: params.tripEnd,
        limit: readLimit,
        offset: readOffset,
      });
    }

    const chReadAvailable =
      read != null &&
      read.status !== 'UNAVAILABLE' &&
      read.status !== 'QUERY_FAILED';

    const hfDataPresent =
      read != null &&
      read.available &&
      read.status === 'SUCCESS' &&
      read.returnedCount > 0;

    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability,
      tripId: params.tripId,
      tripRpmProfile,
      vehicleActiveRpmProfile,
      hfDataPresent,
      chReadAvailable,
      tenantScopeViolation: read?.tenantScopeViolation ?? false,
    });

    const points =
      admission.processingAllowed && read?.status === 'SUCCESS' ? read.points : [];

    const dataQuality = buildDs4RpmHfV1aDataQuality({
      read,
      points,
    });

    if (read?.tenantScopeViolation) {
      this.logger.warn(
        JSON.stringify({
          event: 'DS4_RPM_HF_V1A_TENANT_SCOPE_VIOLATION',
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
          tripId: params.tripId,
        }),
      );
    }

    return {
      contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
      organizationId: params.organizationId,
      vehicleId: params.vehicleId,
      tripId: params.tripId,
      providerSourceLinkId: linkId,
      tripStartIso: params.tripStart.toISOString(),
      tripEndIso: params.tripEnd.toISOString(),
      admission,
      dataQuality,
      clickHouseRead: {
        status: read?.status ?? 'UNAVAILABLE',
        available: read?.available ?? false,
        degradedReason: read?.degradedReason ?? null,
        tenantScopeViolation: read?.tenantScopeViolation ?? false,
      },
      rpmPoints: points.map((p) => ({
        recordedAtIso: p.recordedAtIso,
        valueRpm: p.valueRpm,
      })),
      vsiActiveRpmProfileSnapshot: activeRpmProfileSnapshot,
      readOnly: true,
      productionActivationForbidden: true,
    };
  }

  private async resolveDimoSourceLinkId(vehicleId: string): Promise<string | null> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId, isActive: true, provider: 'DIMO' },
      orderBy: { activatedAt: 'desc' },
      select: { id: true },
    });
    return link?.id ?? null;
  }
}
