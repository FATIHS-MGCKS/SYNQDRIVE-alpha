import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { projectVsiApdsShadowLvAvailability } from '../../../../modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-shadow-lv-availability.projection';
import type { VsiApdsShadowLvAvailabilityProjectionV1 } from '../../../../modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-shadow-lv-availability.types';
import { resolveHistoricalActiveSourceLinkUniqueness } from '../../../../modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-historical-link-uniqueness';
import { isProviderSourceLinkActiveAtDecision } from '../../../../modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-apds-shadow-opportunity-binding';
import { VsiCapabilityResolverRepository } from '../../../../modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-capability-resolver.repository';
import { buildP25ApdProfileLvLoaderWhere } from '../adaptive-polling-policy/p25-apd-profile-lv-loader';

@Injectable()
export class ApdShadowVsiLvAvailabilityLoader {
  private readonly profiles: VsiCapabilityResolverRepository;

  constructor(private readonly prisma: PrismaService) {
    this.profiles = new VsiCapabilityResolverRepository(prisma);
  }

  async projectForDecision(input: {
    organizationId: string;
    vehicleId: string;
    decisionAtMs: number;
    profileEligibleGapCount: number;
    baselineProfileInvalidationReason: string | null;
  }): Promise<VsiApdsShadowLvAvailabilityProjectionV1> {
    const historicalLinkRows = await this.profiles.listVehicleSourceLinksForHistoricalAttribution(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    );
    const historicalUniqueness = resolveHistoricalActiveSourceLinkUniqueness({
      links: historicalLinkRows.links,
      decisionAtMs: input.decisionAtMs,
      attributionRowLimitExceeded: historicalLinkRows.rowLimitExceeded,
    });

    const activeLinkId =
      historicalUniqueness.historicalActiveLinkCount === 1
        ? historicalUniqueness.historicalActiveLinkIds[0]!
        : null;

    let linkContext = null;
    if (activeLinkId) {
      linkContext = await this.profiles.loadLinkContext({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: activeLinkId,
      });
    }

    const profileBundle =
      activeLinkId != null
        ? await this.profiles.loadProfileContextWithTemporal({
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            providerSourceLinkId: activeLinkId,
          })
        : null;

    const lvSignal = profileBundle?.profile?.signals.find(
      (s) => s.canonicalSignalKey === 'lv_voltage',
    );

    const strictRestCount = await this.prisma.batteryMeasurement.count({
      where: buildP25ApdProfileLvLoaderWhere(input.vehicleId, input.decisionAtMs),
    });

    const linkActiveAtDecision =
      linkContext != null &&
      isProviderSourceLinkActiveAtDecision({
        activatedAt: linkContext.activatedAt,
        deactivatedAt: linkContext.deactivatedAt,
        supersededAt: linkContext.supersededAt,
        decisionAtMs: input.decisionAtMs,
      });

    return projectVsiApdsShadowLvAvailability({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      evaluationTimeMs: input.decisionAtMs,
      providerSourceLinkId: activeLinkId,
      linkActiveAtDecision,
      tenantScopeMatch: linkContext?.organizationId === input.organizationId,
      activeSourceLinkCountAtDecision: historicalUniqueness.historicalActiveLinkCount ?? 0,
      historicalLinkAttributionComplete: historicalUniqueness.evidenceComplete,
      lvDeclaredSupport: lvSignal?.declaredSupport ?? null,
      lvEmpiricalObservation: lvSignal?.empiricalObservation ?? null,
      strictRestLiveVoltageMeasurementCount: strictRestCount,
      profileEligibleGapCount: input.profileEligibleGapCount,
      baselineProfileInvalidationReason: input.baselineProfileInvalidationReason,
    });
  }
}
