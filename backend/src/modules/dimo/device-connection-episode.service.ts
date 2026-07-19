/**
 * Persistent device-connection episode lifecycle (binding-scoped).
 * Events remain immutable; current state is episode-backed, not window-derived.
 */
import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionEpisodeLifecycleAction,
  DeviceConnectionEpisodeOpenedReason,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildCanonicalDeviceBinding,
  bindingScopeChanged,
  bindingScopeMatches,
  describeBindingScopeChange,
  type CanonicalDeviceBinding,
} from './device-binding-lifecycle';
import { EpisodeConflictReasonCode, mergeReasonCodes } from './device-connection-episode-conflict';
import {
  evaluateLateUnplugAgainstRecovery,
  evaluatePlugCloseEligibility,
} from './device-connection-event-order';

export type EpisodeOpenOutcome =
  | 'created'
  | 'already_open'
  | 'superseded_and_created'
  | 'ignored_stale'
  | 'requires_review';

export type EpisodeResolveOutcome =
  | 'resolved'
  | 'no_open_episode'
  | 'binding_mismatch'
  | 'invalid_resolution_time'
  | 'ignored_stale';

export interface EpisodeBindingRefs {
  deviceBindingId: string | null;
  providerDeviceIdHash: string;
}

export interface OpenEpisodeFromUnplugInput {
  organizationId: string;
  vehicleId: string;
  provider?: string;
  eventId: string;
  observedAt: Date;
  receivedAt?: Date;
  tokenId: number;
}

export interface ResolveEpisodeFromPlugInput {
  organizationId: string;
  vehicleId: string;
  provider?: string;
  eventId: string;
  observedAt: Date;
  receivedAt?: Date;
  tokenId: number;
}

export interface ReconcileBindingDriftInput {
  organizationId: string;
  vehicleId: string;
  provider?: string;
  tokenId: number;
  hardwareType: string | null;
  evidenceAt: Date;
}

export function hashProviderDeviceId(provider: string, tokenId: number): string {
  return createHash('sha256')
    .update(`${provider}:${tokenId}`)
    .digest('hex')
    .slice(0, 32);
}

@Injectable()
export class DeviceConnectionEpisodeService {
  private readonly logger = new Logger(DeviceConnectionEpisodeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveCanonicalBinding(
    vehicleId: string,
    provider: string,
    tokenId: number,
    hardwareType: string | null = null,
  ): Promise<CanonicalDeviceBinding> {
    const [link, vehicle] = await Promise.all([
      this.prisma.vehicleDataSourceLink.findFirst({
        where: { vehicleId, provider, isActive: true },
        orderBy: { activatedAt: 'desc' },
        select: {
          id: true,
          sourceType: true,
          sourceSubtype: true,
          sourceReferenceId: true,
          activatedAt: true,
          deactivatedAt: true,
        },
      }),
      hardwareType == null
        ? this.prisma.vehicle.findUnique({
            where: { id: vehicleId },
            select: { hardwareType: true },
          })
        : Promise.resolve({ hardwareType }),
    ]);

    return buildCanonicalDeviceBinding({
      provider,
      dimoTokenId: tokenId,
      hardwareType: hardwareType ?? vehicle?.hardwareType ?? null,
      link,
    });
  }

  async resolveBindingRefs(
    vehicleId: string,
    provider: string,
    tokenId: number,
  ): Promise<EpisodeBindingRefs> {
    const binding = await this.resolveCanonicalBinding(vehicleId, provider, tokenId);
    return {
      deviceBindingId: binding.bindingId,
      providerDeviceIdHash: binding.providerDeviceIdHash,
    };
  }

  async findOpenEpisodeForVehicle(
    organizationId: string,
    vehicleId: string,
    provider = 'DIMO',
    tokenId?: number,
    hardwareType: string | null = null,
  ) {
    const openEpisodes = await this.prisma.deviceConnectionEpisode.findMany({
      where: {
        organizationId,
        vehicleId,
        provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });

    if (openEpisodes.length === 0) return null;
    if (tokenId == null) return openEpisodes[0] ?? null;

    const binding = await this.resolveCanonicalBinding(
      vehicleId,
      provider,
      tokenId,
      hardwareType,
    );

    return (
      openEpisodes.find((episode) => bindingScopeMatches(episode, binding)) ?? null
    );
  }

  async findOpenEpisode(
    organizationId: string,
    vehicleId: string,
    provider: string,
    binding: CanonicalDeviceBinding,
  ) {
    const openEpisodes = await this.prisma.deviceConnectionEpisode.findMany({
      where: {
        organizationId,
        vehicleId,
        provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
    });

    return (
      openEpisodes.find((episode) => bindingScopeMatches(episode, binding)) ?? null
    );
  }

  async findOpenEpisodesForVehicles(
    organizationId: string,
    vehicleIds: string[],
  ) {
    if (vehicleIds.length === 0) return [];
    return this.prisma.deviceConnectionEpisode.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
    });
  }

  async reconcileBindingDrift(
    input: ReconcileBindingDriftInput,
  ): Promise<{ supersededEpisodeIds: string[] }> {
    const provider = input.provider ?? 'DIMO';
    const binding = await this.resolveCanonicalBinding(
      input.vehicleId,
      provider,
      input.tokenId,
      input.hardwareType,
    );

    const openEpisodes = await this.prisma.deviceConnectionEpisode.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
    });

    const supersededEpisodeIds: string[] = [];
    for (const episode of openEpisodes) {
      if (!bindingScopeChanged(episode, binding)) continue;
      await this.supersedeEpisode(
        episode.id,
        DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
        input.evidenceAt,
        describeBindingScopeChange(episode, binding),
      );
      await this.writeLifecycleAudit({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        episodeId: episode.id,
        action: DeviceConnectionEpisodeLifecycleAction.BINDING_DRIFT_RECONCILED,
        reasonCodes: describeBindingScopeChange(episode, binding),
        providerObservedAt: input.evidenceAt,
        receivedAt: input.evidenceAt,
        metadata: {
          currentBindingId: binding.bindingId,
          currentProviderDeviceIdHash: binding.providerDeviceIdHash,
        },
      });
      supersededEpisodeIds.push(episode.id);
    }

    return { supersededEpisodeIds };
  }

  async openFromUnplugEvent(
    input: OpenEpisodeFromUnplugInput,
  ): Promise<{ outcome: EpisodeOpenOutcome; episodeId: string }> {
    const provider = input.provider ?? 'DIMO';
    const receivedAt = input.receivedAt ?? input.observedAt;
    const binding = await this.resolveCanonicalBinding(
      input.vehicleId,
      provider,
      input.tokenId,
    );

    const openEpisodes = await this.prisma.deviceConnectionEpisode.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
    });

    let superseded = false;
    for (const episode of openEpisodes) {
      if (!bindingScopeChanged(episode, binding)) continue;
      const reasonCodes = describeBindingScopeChange(episode, binding);
      await this.supersedeEpisode(
        episode.id,
        DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
        input.observedAt,
        reasonCodes,
      );
      await this.writeLifecycleAudit({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        episodeId: episode.id,
        action: DeviceConnectionEpisodeLifecycleAction.SUPERSEDED_BY_BINDING_CHANGE,
        reasonCodes,
        providerObservedAt: input.observedAt,
        receivedAt,
      });
      superseded = true;
    }

    const sameBindingOpen = openEpisodes.find((episode) =>
      bindingScopeMatches(episode, binding),
    );
    if (sameBindingOpen) {
      return { outcome: 'already_open', episodeId: sameBindingOpen.id };
    }

    const latestClosed = await this.prisma.deviceConnectionEpisode.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        status: {
          in: [
            DeviceConnectionEpisodeStatus.RESOLVED,
            DeviceConnectionEpisodeStatus.SUPERSEDED,
          ],
        },
      },
      orderBy: [{ resolutionEvidenceAt: 'desc' }, { openedAt: 'desc' }],
    });

    const unplugDecision = evaluateLateUnplugAgainstRecovery({
      unplugObservedAt: input.observedAt,
      unplugReceivedAt: receivedAt,
      latestClosedEpisode: latestClosed,
      openEpisodeForBinding: null,
    });

    if (unplugDecision.action === 'ignore') {
      await this.writeLifecycleAudit({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        episodeId: latestClosed?.id ?? null,
        action: DeviceConnectionEpisodeLifecycleAction.STALE_EVENT_IGNORED,
        reasonCodes: [unplugDecision.reason],
        providerObservedAt: input.observedAt,
        receivedAt,
      });
      return { outcome: 'ignored_stale', episodeId: latestClosed?.id ?? 'none' };
    }

    if (unplugDecision.action === 'requires_review') {
      const reviewed = await this.prisma.deviceConnectionEpisode.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider,
          deviceBindingId: binding.bindingId,
          providerDeviceIdHash: binding.providerDeviceIdHash,
          openedAt: input.observedAt,
          openedByEventId: input.eventId,
          openedReason: DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
          status: DeviceConnectionEpisodeStatus.REQUIRES_REVIEW,
          reviewReasonCodes: unplugDecision.reasonCodes,
        },
      });
      await this.writeLifecycleAudit({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        episodeId: reviewed.id,
        action: DeviceConnectionEpisodeLifecycleAction.REQUIRES_REVIEW_FLAGGED,
        reasonCodes: unplugDecision.reasonCodes,
        providerObservedAt: input.observedAt,
        receivedAt,
      });
      return { outcome: 'requires_review', episodeId: reviewed.id };
    }

    if (!binding.physicalObdCapable) {
      const reviewed = await this.prisma.deviceConnectionEpisode.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider,
          deviceBindingId: binding.bindingId,
          providerDeviceIdHash: binding.providerDeviceIdHash,
          openedAt: input.observedAt,
          openedByEventId: input.eventId,
          openedReason: DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
          status: DeviceConnectionEpisodeStatus.REQUIRES_REVIEW,
          reviewReasonCodes: [EpisodeConflictReasonCode.OEM_SYNTHETIC_NO_PHYSICAL_BINDING],
        },
      });
      return { outcome: 'requires_review', episodeId: reviewed.id };
    }

    try {
      const created = await this.prisma.deviceConnectionEpisode.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider,
          deviceBindingId: binding.bindingId,
          providerDeviceIdHash: binding.providerDeviceIdHash,
          openedAt: input.observedAt,
          openedByEventId: input.eventId,
          openedReason: DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
          status: DeviceConnectionEpisodeStatus.OPEN,
        },
      });

      this.logger.log(
        `Opened device connection episode ${created.id} for vehicle ${input.vehicleId}`,
      );

      return {
        outcome: superseded ? 'superseded_and_created' : 'created',
        episodeId: created.id,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.findOpenEpisode(
          input.organizationId,
          input.vehicleId,
          provider,
          binding,
        );
        if (raced) {
          return { outcome: 'already_open', episodeId: raced.id };
        }
      }
      throw err;
    }
  }

  async resolveFromExplicitPlugEvent(
    input: ResolveEpisodeFromPlugInput,
  ): Promise<{ outcome: EpisodeResolveOutcome; episodeId?: string }> {
    const provider = input.provider ?? 'DIMO';
    const receivedAt = input.receivedAt ?? input.observedAt;
    const binding = await this.resolveCanonicalBinding(
      input.vehicleId,
      provider,
      input.tokenId,
    );

    const openEpisodes = await this.prisma.deviceConnectionEpisode.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
    });

    const open =
      openEpisodes.find((episode) => episode.deviceBindingId === binding.bindingId) ??
      openEpisodes.find((episode) => bindingScopeMatches(episode, binding)) ??
      null;

    if (
      open &&
      open.providerDeviceIdHash != null &&
      open.providerDeviceIdHash !== binding.providerDeviceIdHash
    ) {
      return { outcome: 'binding_mismatch' };
    }

    const plugDecision = evaluatePlugCloseEligibility({
      openEpisode: open,
      plugObservedAt: input.observedAt,
      plugReceivedAt: receivedAt,
      bindingMatches: open ? bindingScopeMatches(open, binding) : false,
    });

    if (plugDecision.action === 'reject') {
      if (plugDecision.reason === 'no_open_episode') {
        return { outcome: 'no_open_episode' };
      }
      if (plugDecision.reason === 'binding_mismatch') {
        return { outcome: 'binding_mismatch' };
      }
      return { outcome: 'invalid_resolution_time' };
    }

    if (plugDecision.action === 'ignore') {
      await this.writeLifecycleAudit({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        episodeId: open?.id ?? null,
        action: DeviceConnectionEpisodeLifecycleAction.STALE_EVENT_IGNORED,
        reasonCodes: [plugDecision.reason],
        providerObservedAt: input.observedAt,
        receivedAt,
      });
      return { outcome: 'ignored_stale' };
    }

    await this.prisma.deviceConnectionEpisode.update({
      where: { id: open!.id },
      data: {
        status: DeviceConnectionEpisodeStatus.RESOLVED,
        resolvedAt: input.observedAt,
        resolutionMethod:
          DeviceConnectionEpisodeResolutionMethod.EXPLICIT_PLUG_WEBHOOK,
        resolutionEvidenceAt: input.observedAt,
        resolutionEventId: input.eventId,
        stateVersion: { increment: 1 },
      },
    });

    return { outcome: 'resolved', episodeId: open!.id };
  }

  private async supersedeEpisode(
    episodeId: string,
    method: DeviceConnectionEpisodeResolutionMethod,
    evidenceAt: Date,
    reasonCodes: EpisodeConflictReasonCode[] = [],
  ): Promise<void> {
    const current = await this.prisma.deviceConnectionEpisode.findUnique({
      where: { id: episodeId },
      select: { reviewReasonCodes: true },
    });

    await this.prisma.deviceConnectionEpisode.update({
      where: { id: episodeId },
      data: {
        status: DeviceConnectionEpisodeStatus.SUPERSEDED,
        resolvedAt: evidenceAt,
        resolutionMethod: method,
        resolutionEvidenceAt: evidenceAt,
        reviewReasonCodes: mergeReasonCodes(current?.reviewReasonCodes ?? [], reasonCodes),
        stateVersion: { increment: 1 },
      },
    });
  }

  private async writeLifecycleAudit(input: {
    organizationId: string;
    vehicleId: string;
    episodeId: string | null;
    action: DeviceConnectionEpisodeLifecycleAction;
    reasonCodes: string[];
    providerObservedAt?: Date;
    receivedAt?: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.deviceConnectionEpisodeLifecycleAudit.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        episodeId: input.episodeId,
        action: input.action,
        reasonCodes: input.reasonCodes,
        providerObservedAt: input.providerObservedAt ?? null,
        receivedAt: input.receivedAt ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
