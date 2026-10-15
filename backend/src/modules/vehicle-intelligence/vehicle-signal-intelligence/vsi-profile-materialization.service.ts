import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { projectConnectionIdentitiesFromLinks } from './vsi-connection-identity-projection';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { evaluateVsiSignalProfile } from './vsi-profile-evaluator';
import { fingerprintVsiProfileEvaluation } from './vsi-profile-fingerprint.util';
import type { VsiProfileEvaluationResult } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import type { VsiSourceLinkRow } from './vsi-readonly-composer.types';

const DEFAULT_POLL_LOG_LIMIT = 5;

export type VsiProfileMaterializeFromSnapshotInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string | null;
  /** When true, skip when VLS binding does not match the target link. */
  requireBindingMatch?: boolean;
};

@Injectable()
export class VsiSignalProfileMaterializationService {
  private readonly logger = new Logger(VsiSignalProfileMaterializationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly declaredCatalog: VsiDeclaredCatalogResolver,
  ) {}

  async getProfileForLink(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ) {
    const row = await this.prisma.vehicleSignalCapabilityProfile.findFirst({
      where: { organizationId, vehicleId, providerSourceLinkId },
    });
    if (!row) {
      throw new NotFoundException('VSI signal capability profile not found');
    }
    return row;
  }

  async listProfilesForVehicle(organizationId: string, vehicleId: string) {
    return this.prisma.vehicleSignalCapabilityProfile.findMany({
      where: { organizationId, vehicleId },
      orderBy: { evaluatedAt: 'desc' },
    });
  }

  /**
   * Idempotent profile upsert from persisted VLS + cached catalog evidence.
   * Non-blocking callers must catch/log errors externally.
   */
  async materializeFromPersistedEvidence(
    input: VsiProfileMaterializeFromSnapshotInput,
  ): Promise<VsiProfileEvaluationResult | null> {
    const { organizationId, vehicleId, providerSourceLinkId } = input;
    if (!providerSourceLinkId) {
      return null;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        registryLifecycle: true,
        hardwareType: true,
      },
    });
    if (!vehicle) {
      return null;
    }

    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { id: providerSourceLinkId, vehicleId, isActive: true },
      select: {
        id: true,
        provider: true,
        isActive: true,
        metadata: true,
        consentId: true,
      },
    });
    if (!link) {
      return null;
    }

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
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

    if (
      input.requireBindingMatch !== false &&
      latestState?.providerBindingId &&
      latestState.providerBindingId !== providerSourceLinkId
    ) {
      return null;
    }

    const existingProfile = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId,
          providerSourceLinkId,
        },
      },
    });

    const priorSource =
      existingProfile?.lastMaterializedSourceTimestamp ??
      null;
    if (
      latestState?.sourceTimestamp &&
      priorSource &&
      latestState.sourceTimestamp.getTime() < priorSource.getTime()
    ) {
      this.logger.debug(
        `VSI profile skip out-of-order source for vehicle=${vehicleId} link=${providerSourceLinkId}`,
      );
      return null;
    }

    const pollLogs = await this.prisma.dimoPollLog.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_POLL_LOG_LIMIT,
      select: { status: true, startedAt: true, finishedAt: true },
    });

    const linkRow: VsiSourceLinkRow = {
      id: link.id,
      provider: link.provider,
      isActive: link.isActive,
      metadata: link.metadata,
      consentId: link.consentId,
    };

    const identity =
      projectConnectionIdentitiesFromLinks([linkRow], {
        organizationId,
        vehicleId,
      })[0] ?? null;
    if (!identity) {
      return null;
    }

    const declared = await this.declaredCatalog.resolveForVehicle(organizationId, vehicleId);

    const evaluationDraft = evaluateVsiSignalProfile(
      {
        organizationId,
        vehicleId,
        registryLifecycle: vehicle.registryLifecycle,
        hardwareTypeLegacy: vehicle.hardwareType,
        link: linkRow,
        identity,
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
        declaredCatalog: declared,
        priorAggregatedSourceTimestamp: priorSource,
        priorProvenStrictSourceAdvanceAt:
          existingProfile?.lastProvenStrictSourceAdvanceAt ?? null,
      },
      this.declaredCatalog,
    );

    const fingerprint = fingerprintVsiProfileEvaluation(evaluationDraft);
    if (existingProfile?.contentFingerprint === fingerprint) {
      return evaluationDraft;
    }

    await this.persistEvaluation(evaluationDraft, existingProfile);
    return evaluationDraft;
  }

  private async persistEvaluation(
    evaluation: VsiProfileEvaluationResult,
    existingProfile: {
      id: string;
      profileRevision: number;
      contentFingerprint: string;
    } | null,
  ): Promise<void> {
    const fingerprint = fingerprintVsiProfileEvaluation(evaluation);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId: evaluation.organizationId,
            vehicleId: evaluation.vehicleId,
            providerSourceLinkId: evaluation.providerSourceLinkId,
          },
        },
      });

      const nextRevision = existing ? existing.profileRevision + 1 : 1;

      const data = {
        organizationId: evaluation.organizationId,
        vehicleId: evaluation.vehicleId,
        providerSourceLinkId: evaluation.providerSourceLinkId,
        providerIdentity: evaluation.providerIdentity,
        verifiedModality: evaluation.verifiedModality,
        telemetrySourceFamily: evaluation.telemetrySourceFamily,
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        profileRevision: nextRevision,
        contentFingerprint: fingerprint,
        evaluatedAt: evaluation.evaluatedAt,
        declaredCatalogCheckedAt: evaluation.declaredCatalogCheckedAt,
        lastMaterializedSourceTimestamp: evaluation.lastMaterializedSourceTimestamp,
        lastMaterializedProviderFetchAt: evaluation.lastMaterializedProviderFetchAt,
        lastProvenStrictSourceAdvanceAt: evaluation.lastProvenStrictSourceAdvanceAt,
        signalsSnapshot: evaluation.signals as unknown as Prisma.InputJsonValue,
        profileLimitations: evaluation.profileLimitations as Prisma.InputJsonValue,
      };

      if (existing) {
        await tx.vehicleSignalCapabilityProfile.update({
          where: { id: existing.id },
          data,
        });
        return;
      }

      await tx.vehicleSignalCapabilityProfile.create({ data });
    });
  }
}
