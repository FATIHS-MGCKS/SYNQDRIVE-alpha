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

export type VsiProfileLifecycleMaterializationMode =
  | 'SNAPSHOT_HOOK'
  | 'SOURCE_LINK_ACTIVATED'
  | 'DECLARED_CATALOG_ADVANCED'
  | 'BACKFILL_RECONCILE'
  | 'MANUAL_RECOVERY';

export type VsiProfileMaterializeFromSnapshotInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string | null;
  /** When true, skip when VLS binding does not match the target link. */
  requireBindingMatch?: boolean;
  /**
   * P2 lifecycle modes allow declared-only initialization without VLS binding match.
   * Snapshot hook keeps strict binding semantics by default.
   */
  lifecycleMode?: VsiProfileLifecycleMaterializationMode;
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

    const strictBinding =
      input.lifecycleMode === 'SOURCE_LINK_ACTIVATED' ||
      input.lifecycleMode === 'BACKFILL_RECONCILE' ||
      input.lifecycleMode === 'DECLARED_CATALOG_ADVANCED'
        ? false
        : input.requireBindingMatch !== false;

    if (
      strictBinding &&
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

    const declared = await this.declaredCatalog.resolveForMaterialization(
      organizationId,
      vehicleId,
      providerSourceLinkId,
      link.provider,
    );

    if (
      existingProfile &&
      latestState?.sourceTimestamp &&
      latestState?.providerFetchedAt &&
      existingProfile.lastMaterializedSourceTimestamp?.getTime() ===
        latestState.sourceTimestamp.getTime() &&
      existingProfile.lastMaterializedProviderFetchAt?.getTime() ===
        latestState.providerFetchedAt.getTime()
    ) {
      const catalogAdvanced =
        declared.checkedAt &&
        existingProfile.declaredCatalogCheckedAt &&
        declared.checkedAt > existingProfile.declaredCatalogCheckedAt;
      if (!catalogAdvanced) {
        return null;
      }
    }

    const projectionAsOf =
      latestState?.providerFetchedAt ??
      latestState?.updatedAt ??
      new Date();

    const evaluationDraft = evaluateVsiSignalProfile(
      {
        organizationId,
        vehicleId,
        registryLifecycle: vehicle.registryLifecycle,
        hardwareTypeLegacy: vehicle.hardwareType,
        link: linkRow,
        identity,
        projectionAsOf,
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
        priorAggregatedSourceTimestamp:
          existingProfile?.lastProvenStrictSourceAdvanceAt ?? priorSource,
        priorProvenStrictSourceAdvanceAt:
          existingProfile?.lastProvenStrictSourceAdvanceAt ?? null,
      },
      this.declaredCatalog,
    );

    const fingerprint = fingerprintVsiProfileEvaluation(evaluationDraft);
    if (existingProfile?.contentFingerprint === fingerprint) {
      return evaluationDraft;
    }

    await this.persistWithConcurrencyRetry(evaluationDraft);
    return evaluationDraft;
  }

  private async persistWithConcurrencyRetry(
    evaluation: VsiProfileEvaluationResult,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const existingProfile = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
          where: {
            organizationId_vehicleId_providerSourceLinkId: {
              organizationId: evaluation.organizationId,
              vehicleId: evaluation.vehicleId,
              providerSourceLinkId: evaluation.providerSourceLinkId,
            },
          },
        });
        await this.persistEvaluation(evaluation, existingProfile);
        return;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : '';
        if (
          (code === 'P2002' || message === 'VSI_PROFILE_REVISION_CONFLICT') &&
          attempt < 2
        ) {
          continue;
        }
        throw err;
      }
    }
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
        const updated = await tx.vehicleSignalCapabilityProfile.updateMany({
          where: {
            id: existing.id,
            profileRevision: existing.profileRevision,
          },
          data,
        });
        if (updated.count === 0) {
          throw new Error('VSI_PROFILE_REVISION_CONFLICT');
        }
        return;
      }

      await tx.vehicleSignalCapabilityProfile.create({ data });
    });
  }

  /**
   * Recovery path when async snapshot hook logged a failure — re-reads VLS + cached catalog only.
   */
  async rematerializeForCertification(
    input: VsiProfileMaterializeFromSnapshotInput,
  ): Promise<VsiProfileEvaluationResult | null> {
    try {
      return await this.materializeFromPersistedEvidence({
        ...input,
        lifecycleMode: input.lifecycleMode ?? 'MANUAL_RECOVERY',
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'VSI_PROFILE_REVISION_CONFLICT') {
        return await this.materializeFromPersistedEvidence({
          ...input,
          lifecycleMode: input.lifecycleMode ?? 'MANUAL_RECOVERY',
        });
      }
      throw err;
    }
  }

  async listActiveProviderLinksForVehicle(organizationId: string, vehicleId: string) {
    return this.prisma.vehicleDataSourceLink.findMany({
      where: { vehicleId, isActive: true, vehicle: { organizationId } },
      select: { id: true, provider: true },
      orderBy: { activatedAt: 'asc' },
    });
  }

  async listActiveLinksMissingProfiles(input: {
    organizationId?: string;
    afterLinkId?: string | null;
    limit: number;
  }) {
    const links = await this.prisma.vehicleDataSourceLink.findMany({
      where: {
        isActive: true,
        ...(input.organizationId
          ? { vehicle: { organizationId: input.organizationId, registryLifecycle: 'ACTIVE' } }
          : { vehicle: { registryLifecycle: 'ACTIVE' } }),
        ...(input.afterLinkId ? { id: { gt: input.afterLinkId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit,
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    const missing: Array<{ id: string; vehicleId: string; organizationId: string }> = [];
    for (const link of links) {
      const profile = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId: link.vehicle.organizationId,
            vehicleId: link.vehicleId,
            providerSourceLinkId: link.id,
          },
        },
        select: { id: true },
      });
      if (!profile) {
        missing.push({
          id: link.id,
          vehicleId: link.vehicleId,
          organizationId: link.vehicle.organizationId,
        });
      }
    }
    return missing;
  }

  /**
   * Lifecycle deactivation/supersession — preserve historical signals snapshot; append limitations only.
   */
  async appendLifecycleLimitations(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    limitations: string[];
    reason?: string;
  }): Promise<void> {
    const existing = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.providerSourceLinkId,
        },
      },
    });
    if (!existing) {
      return;
    }

    const current = Array.isArray(existing.profileLimitations)
      ? (existing.profileLimitations as string[])
      : [];
    const merged = [...new Set([...current, ...input.limitations])];
    if (merged.length === current.length) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.vehicleSignalCapabilityProfile.findUnique({
        where: { id: existing.id },
      });
      if (!row) {
        return;
      }
      const updated = await tx.vehicleSignalCapabilityProfile.updateMany({
        where: { id: row.id, profileRevision: row.profileRevision },
        data: {
          profileLimitations: merged as unknown as Prisma.InputJsonValue,
          profileRevision: row.profileRevision + 1,
          evaluatedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new Error('VSI_PROFILE_REVISION_CONFLICT');
      }
    });
  }
}
