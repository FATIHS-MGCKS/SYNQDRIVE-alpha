import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildSnapshotReferenceId,
  evaluateSnapshotPlugResolution,
} from '../device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
import { hashProviderDeviceId } from '../device-connection-episode.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { extractObdPlugSignalFromSignals } from './device-connection-physical-state.obd-evidence';
import { buildSnapshotPlugRepairGtR1Proof } from './physical-state-gt-r1-proof';
import { buildLegacySnapshotShadowDecision } from './physical-state-legacy-shadow-decision';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import type { PhysicalEvidenceWriterResult } from './physical-state-evidence-writer.types';

export type SnapshotPhysicalEvidenceInput = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  signals: Record<string, unknown>;
  providerBindingId: string | null;
  hardwareType: string;
  sourceSubtype: string | null;
  fetchedAt: Date;
  vehicleLatestStateId: string;
};

/**
 * Production snapshot physical-evidence orchestration used by DimoSnapshotProcessor.
 * Single call graph for writer wiring, legacy evaluation, GT-R1 proof, and shadow compare.
 */
@Injectable()
export class PhysicalStateSnapshotEvidenceOrchestrator {
  private readonly logger = new Logger(PhysicalStateSnapshotEvidenceOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly physicalEvidenceWriter: PhysicalStateEvidenceWriterService,
  ) {}

  async applyPhysicalSnapshotEvidence(
    input: SnapshotPhysicalEvidenceInput,
  ): Promise<PhysicalEvidenceWriterResult | null> {
    if (!this.physicalEvidenceWriter.isWriterCapable()) return null;

    const obd = extractObdPlugSignalFromSignals(input.signals);
    if (!obd) return null;

    const snapshotReferenceId = buildSnapshotReferenceId({
      vehicleLatestStateId: input.vehicleLatestStateId,
      providerObservedAt: obd.evidenceObservedAt,
    });

    const [openEpisode, lastLegacyEvent] = await Promise.all([
      this.prisma.deviceConnectionEpisode.findFirst({
        where: {
          vehicleId: input.vehicleId,
          provider: 'DIMO',
          status: 'OPEN',
        },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.dimoDeviceConnectionEvent.findFirst({
        where: { vehicleId: input.vehicleId, provider: 'DIMO' },
        orderBy: { observedAt: 'desc' },
        select: { eventType: true, observedAt: true },
      }),
    ]);

    const legacyEval = evaluateSnapshotPlugResolution(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        hardwareType: input.hardwareType,
        obdIsPluggedIn: obd.obdIsPluggedIn,
        providerObservedAt: obd.evidenceObservedAt,
        receivedAt: input.fetchedAt,
        snapshotSource: 'dimo',
        providerBindingId: input.providerBindingId,
        providerDeviceIdHash: hashProviderDeviceId('DIMO', input.tokenId),
        snapshotReferenceId,
        sourceSubtype: input.sourceSubtype,
      },
      openEpisode,
    );

    const physicalBindingScope = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: input.tokenId,
      deviceBindingId: input.providerBindingId,
    });

    const legacyShadow = buildLegacySnapshotShadowDecision({
      evaluation: legacyEval,
      episode: openEpisode,
      lastLegacyEvent: lastLegacyEvent,
    });

    const projection = await this.prisma.deviceConnectionPhysicalState.findFirst({
      where: {
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        bindingKey: physicalBindingScope.bindingKey,
      },
      select: {
        effectiveState: true,
        evidenceObservedAt: true,
      },
    });

    const gtR1Proof = buildSnapshotPlugRepairGtR1Proof({
      physicalProjectionState: projection?.effectiveState ?? null,
      physicalProjectionEvidenceAt: projection?.evidenceObservedAt ?? null,
      snapshotCandidatePlugged: obd.obdIsPluggedIn === true,
      snapshotEvidenceObservedAt: obd.evidenceObservedAt,
      legacyEvaluation: legacyEval,
      physicalBindingScope,
      episode: openEpisode,
      hardwareType: input.hardwareType,
      snapshotSource: 'dimo',
      sourceSubtype: input.sourceSubtype,
      evidenceReferenceId: snapshotReferenceId,
    });

    try {
      return await this.physicalEvidenceWriter.writeSnapshotEvidence({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tokenId: input.tokenId,
        deviceBindingId: input.providerBindingId,
        signals: input.signals,
        evidenceReferenceId: snapshotReferenceId,
        legacyShadow,
        gtR1Proof,
        projectionSelfHeal: obd.obdIsPluggedIn === true,
      });
    } catch (err) {
      this.logger.warn(
        `Physical snapshot evidence writer skipped for ${input.vehicleId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
