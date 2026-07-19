/**
 * Persistent device-connection episode lifecycle (binding-scoped).
 * Events remain immutable; current state is episode-backed, not window-derived.
 */
import { createHash } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { ConnectivityAlertService } from './connectivity-alert/connectivity-alert.service';
import { DeviceConnectionEpisodeResolutionOutboxService } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox.service';
import { ConnectivityObservabilityService } from './connectivity/connectivity-observability.service';

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
  /** Provider-observed binding change time — never processing "now" when historical evidence exists. */
  evidenceAt: Date;
  /** Processing/received time, distinct from evidenceAt when known. */
  receivedAt?: Date;
  /** When set, only supersede this audited episode (reconciliation apply path). */
  episodeId?: string;
  /** Idempotency reference for outbox rows (e.g. evidence package resolutionSnapshotId). */
  resolutionReferenceId?: string;
}

export type ReconcileBindingDriftOutcome =
  | 'superseded'
  | 'no_open_episode'
  | 'already_resolved'
  | 'binding_unchanged';

export interface ReconcileBindingDriftResult {
  outcome: ReconcileBindingDriftOutcome;
  supersededEpisodeIds: string[];
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

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly connectivityAlerts?: ConnectivityAlertService,
    @Optional() private readonly resolutionOutbox?: DeviceConnectionEpisodeResolutionOutboxService,
    @Optional() private readonly observability?: ConnectivityObservabilityService,
  ) {}

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
  ): Promise<ReconcileBindingDriftResult> {
    const provider = input.provider ?? 'DIMO';
    const receivedAt = input.receivedAt ?? input.evidenceAt;
    const resolutionReferenceId =
      input.resolutionReferenceId ??
      `binding-change:${input.vehicleId}:${input.evidenceAt.toISOString()}`;

    if (input.episodeId) {
      const episode = await this.prisma.deviceConnectionEpisode.findFirst({
        where: {
          id: input.episodeId,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider,
        },
        select: {
          id: true,
          status: true,
          deviceBindingId: true,
          providerDeviceIdHash: true,
          reviewReasonCodes: true,
        },
      });

      if (!episode) {
        return { outcome: 'no_open_episode', supersededEpisodeIds: [] };
      }

      if (episode.status !== DeviceConnectionEpisodeStatus.OPEN) {
        return { outcome: 'already_resolved', supersededEpisodeIds: [] };
      }

      const binding = await this.resolveCanonicalBinding(
        input.vehicleId,
        provider,
        input.tokenId,
        input.hardwareType,
      );

      const supersededEpisodeIds = await this.prisma.$transaction(async (tx) =>
        this.supersedeEpisodesForBindingChangeTx(tx, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider,
          binding,
          episodes: [episode],
          evidenceAt: input.evidenceAt,
          receivedAt,
          resolutionReferenceId,
          lifecycleAction: DeviceConnectionEpisodeLifecycleAction.BINDING_DRIFT_RECONCILED,
          requireBindingScopeChange: false,
        }),
      );

      if (supersededEpisodeIds.length === 0) {
        return { outcome: 'binding_unchanged', supersededEpisodeIds: [] };
      }

      this.observability?.log('binding_changed', {
        provider,
        outcome: 'superseded',
      });

      return { outcome: 'superseded', supersededEpisodeIds };
    }

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
      select: {
        id: true,
        deviceBindingId: true,
        providerDeviceIdHash: true,
        reviewReasonCodes: true,
      },
    });

    if (openEpisodes.length === 0) {
      return { outcome: 'no_open_episode', supersededEpisodeIds: [] };
    }

    const supersededEpisodeIds = await this.prisma.$transaction(async (tx) =>
      this.supersedeEpisodesForBindingChangeTx(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        binding,
        episodes: openEpisodes,
        evidenceAt: input.evidenceAt,
        receivedAt,
        resolutionReferenceId,
        lifecycleAction: DeviceConnectionEpisodeLifecycleAction.BINDING_DRIFT_RECONCILED,
        requireBindingScopeChange: true,
      }),
    );

    if (supersededEpisodeIds.length === 0) {
      return { outcome: 'binding_unchanged', supersededEpisodeIds: [] };
    }

    this.observability?.log('binding_changed', {
      provider,
      outcome: 'superseded',
    });

    return { outcome: 'superseded', supersededEpisodeIds };
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
    const supersededEpisodeIds = await this.prisma.$transaction(async (tx) =>
      this.supersedeEpisodesForBindingChangeTx(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        binding,
        episodes: openEpisodes,
        evidenceAt: input.observedAt,
        receivedAt,
        resolutionReferenceId: `binding-change:unplug:${input.eventId}`,
        lifecycleAction: DeviceConnectionEpisodeLifecycleAction.SUPERSEDED_BY_BINDING_CHANGE,
        requireBindingScopeChange: true,
      }),
    );
    superseded = supersededEpisodeIds.length > 0;

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

      await this.emitDeviceUnplugAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider,
        episodeId: created.id,
        stateVersion: created.stateVersion,
        deviceBindingId: binding.bindingId,
        observedAt: input.observedAt,
      });

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

    await this.emitDeviceReconnectAlert({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider,
      episodeId: open!.id,
      deviceBindingId: open!.deviceBindingId,
      recoverySource: 'plug_webhook',
      resolutionMethod: DeviceConnectionEpisodeResolutionMethod.EXPLICIT_PLUG_WEBHOOK,
      observedAt: input.observedAt,
    });

    return { outcome: 'resolved', episodeId: open!.id };
  }

  private async emitDeviceUnplugAlert(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    episodeId: string;
    stateVersion: number;
    deviceBindingId: string | null;
    observedAt: Date;
  }): Promise<void> {
    if (!this.connectivityAlerts) return;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { licensePlate: true, make: true, model: true },
    });
    const label =
      [vehicle?.make, vehicle?.model].filter(Boolean).join(' ').trim() ||
      input.vehicleId;
    await this.connectivityAlerts.onDeviceUnplugged({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
      episodeId: input.episodeId,
      stateVersion: input.stateVersion,
      deviceBindingId: input.deviceBindingId,
      observedAt: input.observedAt,
      label,
      licensePlate: vehicle?.licensePlate,
    });
  }

  private async emitDeviceReconnectAlert(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    episodeId: string;
    deviceBindingId: string | null;
    recoverySource: 'plug_webhook' | 'snapshot_obd' | 'telemetry_resumed';
    resolutionMethod: DeviceConnectionEpisodeResolutionMethod;
    observedAt: Date;
  }): Promise<void> {
    if (!this.connectivityAlerts) return;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { licensePlate: true, make: true, model: true },
    });
    const label =
      [vehicle?.make, vehicle?.model].filter(Boolean).join(' ').trim() ||
      input.vehicleId;
    await this.connectivityAlerts.onEpisodeRecovered({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
      episodeId: input.episodeId,
      stateVersion: 1,
      deviceBindingId: input.deviceBindingId,
      recoverySource: input.recoverySource,
      resolutionMethod: input.resolutionMethod,
      observedAt: input.observedAt,
      label,
      licensePlate: vehicle?.licensePlate,
    });
  }

  private async supersedeEpisodesForBindingChangeTx(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      vehicleId: string;
      provider: string;
      binding: CanonicalDeviceBinding;
      episodes: Array<{
        id: string;
        deviceBindingId: string | null;
        providerDeviceIdHash: string | null;
        reviewReasonCodes: string[];
      }>;
      evidenceAt: Date;
      receivedAt: Date;
      resolutionReferenceId: string;
      lifecycleAction: DeviceConnectionEpisodeLifecycleAction;
      requireBindingScopeChange: boolean;
    },
  ): Promise<string[]> {
    const supersededEpisodeIds: string[] = [];

    for (const episode of input.episodes) {
      if (
        input.requireBindingScopeChange &&
        !bindingScopeChanged(episode, input.binding)
      ) {
        continue;
      }

      const reasonCodes = describeBindingScopeChange(episode, input.binding);
      const claimed = await tx.deviceConnectionEpisode.updateMany({
        where: {
          id: episode.id,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          status: DeviceConnectionEpisodeStatus.OPEN,
        },
        data: {
          status: DeviceConnectionEpisodeStatus.SUPERSEDED,
          resolvedAt: input.evidenceAt,
          resolutionMethod: DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
          resolutionEvidenceAt: input.evidenceAt,
          reviewReasonCodes: mergeReasonCodes(episode.reviewReasonCodes, reasonCodes),
          stateVersion: { increment: 1 },
        },
      });

      if (claimed.count === 0) continue;

      await tx.deviceConnectionEpisodeLifecycleAudit.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          episodeId: episode.id,
          action: input.lifecycleAction,
          reasonCodes,
          providerObservedAt: input.evidenceAt,
          receivedAt: input.receivedAt,
          metadata: {
            currentBindingId: input.binding.bindingId,
            currentProviderDeviceIdHash: input.binding.providerDeviceIdHash,
            resolutionReferenceId: input.resolutionReferenceId,
          } as Prisma.InputJsonValue,
        },
      });

      if (this.resolutionOutbox) {
        await this.resolutionOutbox.enqueuePreparedEvents(tx, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          episodeId: episode.id,
          resolutionSnapshotId: input.resolutionReferenceId,
          resolutionEvidenceAt: input.evidenceAt,
          recoverySource: 'binding_change',
        });
      }

      supersededEpisodeIds.push(episode.id);
    }

    return supersededEpisodeIds;
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
