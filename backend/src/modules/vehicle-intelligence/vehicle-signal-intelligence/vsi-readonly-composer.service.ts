import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { composeReadonlyVehicleSignals } from './vsi-readonly-composer.engine';
import { proveScopedTelemetryAuthorizationFromConsent } from './vsi-readonly-composer.evidence';
import { isVsi03P2cStrictAdvanceReadEnabled } from './vsi03-p2c.config';
import { VsiStrictSourceAdvanceService } from './vsi-strict-source-advance.service';
import type { VsiStrictSourceAdvanceEvaluation } from './vsi-strict-source-advance.types';
import type {
  VsiReadonlyComposerRequest,
  VsiReadonlyComposerResult,
  VsiSourceLinkRow,
} from './vsi-readonly-composer.types';

const MAX_SOURCE_LINKS = 10;
const DEFAULT_POLL_LOG_LIMIT = 5;
const MAX_POLL_LOG_LIMIT = 20;

/**
 * Read-only VSI P1 composer — no provider calls, no persistence writes.
 */
@Injectable()
export class VsiReadonlySignalComposerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strictSourceAdvance: VsiStrictSourceAdvanceService,
  ) {}

  async composeVehicleSignals(
    request: VsiReadonlyComposerRequest,
  ): Promise<VsiReadonlyComposerResult> {
    const projectionAsOf = request.projectionAsOf ?? new Date();
    const pollLogLookbackLimit = Math.min(
      Math.max(request.pollLogLookbackLimit ?? DEFAULT_POLL_LOG_LIMIT, 1),
      MAX_POLL_LOG_LIMIT,
    );

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: request.vehicleId,
        organizationId: request.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        registryLifecycle: true,
        hardwareType: true,
        dimoVehicle: { select: { externalId: true, tokenId: true } },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for tenant scope');
    }

    const links = await this.prisma.vehicleDataSourceLink.findMany({
      where: {
        vehicleId: request.vehicleId,
        isActive: true,
      },
      orderBy: { activatedAt: 'desc' },
      take: MAX_SOURCE_LINKS,
      select: {
        id: true,
        provider: true,
        isActive: true,
        metadata: true,
        consentId: true,
      },
    });

    const consentIds = links.map((l) => l.consentId).filter((id): id is string => Boolean(id));
    const consents =
      consentIds.length > 0
        ? await this.prisma.vehicleProviderConsent.findMany({
            where: { id: { in: consentIds } },
            select: {
              id: true,
              vehicleId: true,
              organizationId: true,
              provider: true,
              grantType: true,
              status: true,
              revokedAt: true,
              expiresAt: true,
              providerVehicleRef: true,
            },
          })
        : [];
    const consentById = new Map(consents.map((c) => [c.id, c]));
    const dimoExternalId = vehicle.dimoVehicle?.externalId ?? null;

    const linkRows: VsiSourceLinkRow[] = links.map((link) => {
      const consent = link.consentId ? consentById.get(link.consentId) ?? null : null;
      return {
        id: link.id,
        provider: link.provider,
        isActive: link.isActive,
        metadata: link.metadata,
        consentId: link.consentId,
        scopedOrgProviderConsentValid: proveScopedTelemetryAuthorizationFromConsent({
          consent,
          organizationId: request.organizationId,
          vehicleId: request.vehicleId,
          dimoExternalId,
          now: projectionAsOf,
        }),
      };
    });

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId: request.vehicleId },
      select: {
        vehicleId: true,
        providerBindingId: true,
        providerSource: true,
        lvBatteryVoltage: true,
        evSoc: true,
        online: true,
        sourceTimestamp: true,
        providerFetchedAt: true,
        updatedAt: true,
        rawPayloadJson: true,
      },
    });

    const pollLogs = await this.prisma.dimoPollLog.findMany({
      where: { vehicleId: request.vehicleId },
      orderBy: { createdAt: 'desc' },
      take: pollLogLookbackLimit,
      select: {
        status: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    const strictAdvanceEvaluations: Record<string, VsiStrictSourceAdvanceEvaluation | undefined> =
      {};
    if (isVsi03P2cStrictAdvanceReadEnabled()) {
      const tokenRef =
        vehicle.dimoVehicle?.tokenId != null ? String(vehicle.dimoVehicle.tokenId) : null;
      const latestSnapshot = latestState
        ? {
            vehicleId: latestState.vehicleId,
            providerBindingId: latestState.providerBindingId,
            providerSource: latestState.providerSource,
            lvBatteryVoltage: latestState.lvBatteryVoltage,
            evSoc: latestState.evSoc,
            online: latestState.online,
            sourceTimestamp: latestState.sourceTimestamp,
            providerFetchedAt: latestState.providerFetchedAt,
            updatedAt: latestState.updatedAt,
            rawPayloadJson: latestState.rawPayloadJson,
          }
        : null;
      for (const link of linkRows) {
        strictAdvanceEvaluations[link.id] = await this.strictSourceAdvance.evaluateForLink({
          organizationId: request.organizationId,
          vehicleId: request.vehicleId,
          link,
          latestState: latestSnapshot,
          dimoTokenReference: tokenRef,
        });
      }
    }

    return composeReadonlyVehicleSignals({
      organizationId: request.organizationId,
      vehicleId: request.vehicleId,
      registryLifecycle: vehicle.registryLifecycle,
      hardwareTypeLegacy: vehicle.hardwareType,
      projectionAsOf,
      links: linkRows,
      latestState: latestState
        ? {
            vehicleId: latestState.vehicleId,
            providerBindingId: latestState.providerBindingId,
            providerSource: latestState.providerSource,
            lvBatteryVoltage: latestState.lvBatteryVoltage,
            evSoc: latestState.evSoc,
            online: latestState.online,
            sourceTimestamp: latestState.sourceTimestamp,
            providerFetchedAt: latestState.providerFetchedAt,
            updatedAt: latestState.updatedAt,
            rawPayloadJson: latestState.rawPayloadJson,
          }
        : null,
      pollLogs,
      strictAdvanceEvaluations: isVsi03P2cStrictAdvanceReadEnabled()
        ? strictAdvanceEvaluations
        : undefined,
      linksQueryCapReached: links.length >= MAX_SOURCE_LINKS,
    });
  }
}
