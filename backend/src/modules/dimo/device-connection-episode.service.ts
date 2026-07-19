/**
 * Persistent device-connection episode lifecycle (binding-scoped).
 * Events remain immutable; current state is episode-backed, not window-derived.
 */
import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceConnectionEpisodeOpenedReason,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export type EpisodeOpenOutcome = 'created' | 'already_open' | 'superseded_and_created';
export type EpisodeResolveOutcome =
  | 'resolved'
  | 'no_open_episode'
  | 'binding_mismatch'
  | 'invalid_resolution_time';

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
  tokenId: number;
}

export interface ResolveEpisodeFromPlugInput {
  organizationId: string;
  vehicleId: string;
  provider?: string;
  eventId: string;
  observedAt: Date;
  tokenId: number;
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

  async resolveBindingRefs(
    vehicleId: string,
    provider: string,
    tokenId: number,
  ): Promise<EpisodeBindingRefs> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId,
        provider,
        isActive: true,
      },
      select: { id: true },
      orderBy: { activatedAt: 'desc' },
    });

    return {
      deviceBindingId: link?.id ?? null,
      providerDeviceIdHash: hashProviderDeviceId(provider, tokenId),
    };
  }

  async findOpenEpisodeForVehicle(
    organizationId: string,
    vehicleId: string,
    provider = 'DIMO',
  ) {
    return this.prisma.deviceConnectionEpisode.findFirst({
      where: {
        organizationId,
        vehicleId,
        provider,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async findOpenEpisode(
    organizationId: string,
    vehicleId: string,
    provider: string,
    deviceBindingId: string | null,
  ) {
    return this.prisma.deviceConnectionEpisode.findFirst({
      where: {
        organizationId,
        vehicleId,
        provider,
        deviceBindingId,
        status: DeviceConnectionEpisodeStatus.OPEN,
      },
    });
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

  async openFromUnplugEvent(
    input: OpenEpisodeFromUnplugInput,
  ): Promise<{ outcome: EpisodeOpenOutcome; episodeId: string }> {
    const provider = input.provider ?? 'DIMO';
    const binding = await this.resolveBindingRefs(
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

    const existingSameBinding = openEpisodes.find(
      (episode) => episode.deviceBindingId === binding.deviceBindingId,
    );
    if (existingSameBinding) {
      return { outcome: 'already_open', episodeId: existingSameBinding.id };
    }

    let superseded = false;
    for (const episode of openEpisodes) {
      if (episode.deviceBindingId === binding.deviceBindingId) continue;
      await this.supersedeEpisode(
        episode.id,
        DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
        input.observedAt,
      );
      superseded = true;
    }

    try {
      const created = await this.prisma.deviceConnectionEpisode.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          provider,
          deviceBindingId: binding.deviceBindingId,
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
          binding.deviceBindingId,
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
    const binding = await this.resolveBindingRefs(
      input.vehicleId,
      provider,
      input.tokenId,
    );

    const open = await this.findOpenEpisode(
      input.organizationId,
      input.vehicleId,
      provider,
      binding.deviceBindingId,
    );
    if (!open) {
      return { outcome: 'no_open_episode' };
    }

    if (
      open.providerDeviceIdHash &&
      open.providerDeviceIdHash !== binding.providerDeviceIdHash
    ) {
      return { outcome: 'binding_mismatch' };
    }

    if (input.observedAt.getTime() < open.openedAt.getTime()) {
      return { outcome: 'invalid_resolution_time' };
    }

    await this.prisma.deviceConnectionEpisode.update({
      where: { id: open.id },
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

    return { outcome: 'resolved', episodeId: open.id };
  }

  private async supersedeEpisode(
    episodeId: string,
    method: DeviceConnectionEpisodeResolutionMethod,
    evidenceAt: Date,
  ): Promise<void> {
    await this.prisma.deviceConnectionEpisode.update({
      where: { id: episodeId },
      data: {
        status: DeviceConnectionEpisodeStatus.SUPERSEDED,
        resolvedAt: evidenceAt,
        resolutionMethod: method,
        resolutionEvidenceAt: evidenceAt,
        stateVersion: { increment: 1 },
      },
    });
  }
}
