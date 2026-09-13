import { Injectable, Logger } from '@nestjs/common';
import { DeviceConnectionPhysicalEvidenceSource, Prisma } from '@prisma/client';
import { isConnectivityPhysicalStateReconciliationEnabled } from '@config/connectivity-physical-state.config';
import {
  extractObdIsPluggedInEvidence,
  type VehicleLatestStateObdRow,
} from './device-connection-physical-state.obd-evidence';
import { recordPhysicalStateReconcileDecision } from './device-connection-physical-state.observability';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import type { PhysicalStateReconcileResult } from './device-connection-physical-state.types';

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
  selfHeal?: boolean;
  allowEpisodeResolution?: boolean;
  hardwareType?: string | null;
  receivedAt?: Date;
  snapshotSource?: string | null;
  sourceSubtype?: string | null;
};

/**
 * Phase 1 foundation: projection + transition audit only.
 * Episode/alert side effects are returned as intents (episodeAction) but NOT
 * executed post-commit — durable outbox wiring is Phase 2.
 */
@Injectable()
export class DeviceConnectionPhysicalStateService {
  private readonly logger = new Logger(DeviceConnectionPhysicalStateService.name);

  constructor(private readonly repository: DeviceConnectionPhysicalStateRepository) {}

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

    this.logAndRecordMetrics(result);
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

    this.logAndRecordMetrics(result);
    return result;
  }

  private logAndRecordMetrics(result: PhysicalStateReconcileResult): void {
    const ctx = result.context;
    this.logger.log(
      JSON.stringify({
        event: 'connectivity_physical_state_reconcile',
        decision: result.decision,
        previousState: ctx.previousState,
        candidateState: ctx.candidateState,
        resultingState: ctx.resultingState,
        previousEvidenceAt: ctx.previousEvidenceAt?.toISOString() ?? null,
        candidateEvidenceAt: ctx.candidateEvidenceAt.toISOString(),
        incomingEvidenceSource: ctx.incomingEvidenceSource,
        stateVersionBefore: ctx.stateVersionBefore,
        stateVersionAfter: ctx.stateVersionAfter,
        selfHeal: ctx.selfHeal,
        evidenceReferenceId: ctx.evidenceReferenceId,
        episodeAction: result.episodeAction,
        alertAction: result.alertAction,
        reason: result.reason ?? null,
      }),
    );

    if (result.decision !== 'DISABLED') {
      recordPhysicalStateReconcileDecision(result);
    }
  }
}
