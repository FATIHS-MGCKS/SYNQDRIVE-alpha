import { Injectable, Logger } from '@nestjs/common';
import { DeviceConnectionPhysicalEvidenceSource, Prisma } from '@prisma/client';
import { isConnectivityPhysicalStateReconciliationEnabled } from '@config/connectivity-physical-state.config';
import { PrismaService } from '@shared/database/prisma.service';
import { DeviceConnectionEpisodeResolutionService } from '../device-connection-episode-resolution/device-connection-episode-resolution.service';
import { DeviceConnectionEpisodeService } from '../device-connection-episode.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import {
  extractObdIsPluggedInEvidence,
  type VehicleLatestStateObdRow,
} from './device-connection-physical-state.obd-evidence';
import { recordPhysicalStateReconcileDecision } from './device-connection-physical-state.observability';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import type {
  PhysicalStateReconcileResult,
  PhysicalTransitionDecision,
} from './device-connection-physical-state.types';

export type PhysicalStateWebhookEvidenceInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  tokenId: number;
  deviceBindingId?: string | null;
  candidateState: 'PLUGGED' | 'UNPLUGGED';
  evidenceObservedAt: Date;
  evidenceReferenceId: string;
  canonicalEventId: string;
  receivedAt?: Date;
  metadataJson?: Prisma.InputJsonValue;
};

export type PhysicalStateSnapshotEvidenceOptions = {
  /** When true, PLUG transitions repair projection drift without episode/alert side effects. */
  selfHeal?: boolean;
  /** When true, snapshot PLUG may resolve an open unplug episode (non-self-heal path). */
  allowEpisodeResolution?: boolean;
  hardwareType?: string | null;
  receivedAt?: Date;
  snapshotSource?: string | null;
  sourceSubtype?: string | null;
};

@Injectable()
export class DeviceConnectionPhysicalStateService {
  private readonly logger = new Logger(DeviceConnectionPhysicalStateService.name);

  constructor(
    private readonly repository: DeviceConnectionPhysicalStateRepository,
    private readonly episodeService: DeviceConnectionEpisodeService,
    private readonly resolutionService: DeviceConnectionEpisodeResolutionService,
    private readonly prisma: PrismaService,
  ) {}

  isReconciliationEnabled(): boolean {
    return isConnectivityPhysicalStateReconciliationEnabled();
  }

  async reconcileWebhookEvidence(
    input: PhysicalStateWebhookEvidenceInput,
  ): Promise<PhysicalStateReconcileResult | null> {
    if (!this.isReconciliationEnabled()) {
      return null;
    }

    const binding = buildBindingScopeFromToken({
      provider: input.provider,
      tokenId: input.tokenId,
      deviceBindingId: input.deviceBindingId ?? null,
    });

    const result = await this.repository.reconcileEvidence({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tokenId: input.tokenId,
      binding,
      evidence: {
        candidateState: input.candidateState,
        evidenceObservedAt: input.evidenceObservedAt,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: input.evidenceReferenceId,
      },
      canonicalEventId: input.canonicalEventId,
      receivedAt: input.receivedAt,
      selfHeal: false,
    });

    await this.applySideEffects(result, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
      tokenId: input.tokenId,
      canonicalEventId: input.canonicalEventId,
      observedAt: input.evidenceObservedAt,
      receivedAt: input.receivedAt ?? input.evidenceObservedAt,
    });

    return result;
  }

  async reconcileSnapshotObdEvidence(
    row: VehicleLatestStateObdRow,
    options: PhysicalStateSnapshotEvidenceOptions = {},
  ): Promise<PhysicalStateReconcileResult | null> {
    if (!this.isReconciliationEnabled()) {
      return null;
    }

    const extracted = extractObdIsPluggedInEvidence(row);
    if (!extracted) {
      return null;
    }

    const selfHeal =
      options.selfHeal === true ||
      (extracted.candidateState === 'PLUGGED' &&
        options.allowEpisodeResolution !== true &&
        options.selfHeal !== false);

    const result = await this.repository.reconcileEvidence({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tokenId: row.dimoTokenId!,
      binding: extracted.binding,
      evidence: {
        candidateState: extracted.candidateState,
        evidenceObservedAt: extracted.evidenceObservedAt,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: extracted.evidenceReferenceId,
      },
      selfHeal,
    });

    await this.applySideEffects(result, {
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      provider: 'DIMO',
      tokenId: row.dimoTokenId!,
      canonicalEventId: null,
      observedAt: extracted.evidenceObservedAt,
      receivedAt: options.receivedAt ?? new Date(),
      hardwareType: options.hardwareType ?? null,
      snapshotReferenceId: extracted.evidenceReferenceId,
      obdIsPluggedIn: extracted.obdIsPluggedIn,
      snapshotSource: options.snapshotSource ?? 'DIMO',
      sourceSubtype: options.sourceSubtype ?? null,
      providerBindingId: row.providerBindingId,
      providerDeviceIdHash: extracted.binding.providerDeviceIdHash,
    });

    return result;
  }

  private async applySideEffects(
    result: PhysicalStateReconcileResult,
    context: {
      organizationId: string;
      vehicleId: string;
      provider: string;
      tokenId: number;
      canonicalEventId: string | null;
      observedAt: Date;
      receivedAt: Date;
      hardwareType?: string | null;
      snapshotReferenceId?: string;
      obdIsPluggedIn?: boolean;
      snapshotSource?: string | null;
      sourceSubtype?: string | null;
      providerBindingId?: string | null;
      providerDeviceIdHash?: string;
    },
  ): Promise<void> {
    this.logDecision(result, context);

    if (result.decision === 'DISABLED' || !result.enabled) {
      return;
    }

    if (result.episodeAction === 'open_unplug' && context.canonicalEventId) {
      await this.episodeService.openFromUnplugEvent({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        provider: context.provider,
        eventId: context.canonicalEventId,
        observedAt: context.observedAt,
        receivedAt: context.receivedAt,
        tokenId: context.tokenId,
      });
      return;
    }

    if (result.episodeAction === 'resolve_plug' && context.obdIsPluggedIn === true) {
      await this.resolutionService.tryResolveFromSnapshotPlugSignal({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        provider: context.provider,
        hardwareType: context.hardwareType ?? (await this.loadHardwareType(context.vehicleId)),
        obdIsPluggedIn: true,
        providerObservedAt: context.observedAt,
        receivedAt: context.receivedAt,
        snapshotSource: context.snapshotSource ?? 'DIMO',
        providerBindingId: context.providerBindingId ?? null,
        providerDeviceIdHash: context.providerDeviceIdHash ?? buildBindingScopeFromToken({
          provider: context.provider,
          tokenId: context.tokenId,
        }).providerDeviceIdHash,
        snapshotReferenceId: context.snapshotReferenceId ?? `snapshot-obd:${context.vehicleId}`,
        sourceSubtype: context.sourceSubtype ?? null,
      });
    }
  }

  private async loadHardwareType(vehicleId: string): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { hardwareType: true },
    });
    return vehicle?.hardwareType ?? null;
  }

  private logDecision(
    result: PhysicalStateReconcileResult,
    context: { vehicleId: string; provider: string; observedAt: Date },
  ): void {
    const payload = {
      event: 'connectivity_physical_state_reconcile',
      vehicleId: context.vehicleId,
      provider: context.provider,
      decision: result.decision,
      previousState: result.projection?.effectiveState ?? null,
      effectiveState: result.projection?.effectiveState ?? null,
      candidateEvidenceAt: context.observedAt.toISOString(),
      episodeAction: result.episodeAction,
      alertAction: result.alertAction,
      reason: result.reason ?? null,
      stateVersion: result.projection?.stateVersion ?? null,
    };
    this.logger.log(JSON.stringify(payload));

    if (result.decision !== 'DISABLED') {
      recordPhysicalStateReconcileDecision(result.decision as PhysicalTransitionDecision, {
        source: result.projection?.evidenceSource ?? 'WEBHOOK',
        previousState: null,
        nextState: result.projection?.effectiveState ?? null,
      });
    }
  }
}
