import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../dtc.service';
import { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import { normalizeDtcSeverityBand } from '../dtc-severity.util';
import type { VehicleHealthAdapterSource } from '@modules/notifications/adapters/notification-adapter.types';
import { evaluateDtcSnapshotDecision } from './dtc-snapshot-decision';
import {
  mergeDtcSnapshotMeta,
  readDtcSnapshotMeta,
} from './dtc-snapshot-meta.util';
import type { DtcSnapshotDecision, DtcSnapshotProposal } from './dtc-snapshot.types';
import type { DtcSnapshotProposalBuildResult } from './dtc-snapshot-proposal.builder';

export interface DtcSnapshotApplyResult {
  decision: DtcSnapshotDecision;
  upserted: string[];
  cleared: string[];
  skippedReason?: string;
}

@Injectable()
export class DtcSnapshotApplyService {
  private readonly logger = new Logger(DtcSnapshotApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dtcService: DtcService,
    @Optional() private readonly notificationIngest?: NotificationProducerIngestService,
  ) {}

  async recordRejectedFetchMetadata(input: {
    vehicleId: string;
    fetchObservedAt: Date;
    pollStatus: string;
    pollError: string;
    auditRef: string;
  }): Promise<void> {
    const existing = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId: input.vehicleId },
      select: { rawPayloadJson: true },
    });
    const rawPayloadJson = mergeDtcSnapshotMeta(existing?.rawPayloadJson, {
      lastFetchAtMs: input.fetchObservedAt.getTime(),
      lastDecisionOutcome: input.pollStatus,
      lastDecisionAtMs: Date.now(),
    });
    await this.prisma.vehicleLatestState.updateMany({
      where: { vehicleId: input.vehicleId },
      data: {
        lastDtcPollAt: input.fetchObservedAt,
        dtcPollStatus: input.pollStatus,
        dtcPollError: input.pollError.slice(0, 500),
        rawPayloadJson: rawPayloadJson as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `DTC-01A rejected fetch metadata vehicle=${input.vehicleId} ref=${input.auditRef} status=${input.pollStatus}`,
    );
  }

  async recordSkippedPoll(input: {
    vehicleId: string;
    fetchObservedAt: Date;
    reason: string;
    auditRef: string;
  }): Promise<void> {
    await this.recordRejectedFetchMetadata({
      vehicleId: input.vehicleId,
      fetchObservedAt: input.fetchObservedAt,
      pollStatus: 'skipped_ineligible',
      pollError: input.reason,
      auditRef: input.auditRef,
    });
  }

  async applyBuiltProposal(
    build: DtcSnapshotProposalBuildResult,
  ): Promise<DtcSnapshotApplyResult> {
    if (!build.ok) {
      const decision: DtcSnapshotDecision = {
        outcome: build.outcome,
        apply: false,
        allowClears: false,
        allowUpserts: false,
        reasons: [build.reason],
      };
      return { decision, upserted: [], cleared: [], skippedReason: build.reason };
    }
    return this.applyProposal(build.proposal);
  }

  async applyProposal(proposal: DtcSnapshotProposal): Promise<DtcSnapshotApplyResult> {
    const latest = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId: proposal.vehicleId },
      select: {
        rawPayloadJson: true,
        sourceTimestamp: true,
        providerBindingId: true,
      },
    });
    const meta = readDtcSnapshotMeta(latest?.rawPayloadJson);
    const head = {
      lastAcceptedSourceAtMs: meta?.lastAcceptedSourceAtMs ?? null,
      lastAcceptedCodesHash: meta?.lastAcceptedCodesHash ?? null,
      lastAcceptedBindingId:
        meta?.lastAcceptedBindingId ?? latest?.providerBindingId ?? null,
    };

    const decision = evaluateDtcSnapshotDecision(head, proposal);
    if (!decision.apply) {
      await this.persistDecisionOnly(proposal, decision);
      this.logger.log(
        `DTC-01A no-apply vehicle=${proposal.vehicleId} outcome=${decision.outcome} ref=${proposal.auditRef} reasons=${decision.reasons.join(',')}`,
      );
      return { decision, upserted: [], cleared: [] };
    }

    const previousActive = await this.prisma.vehicleDtcEvent.findMany({
      where: { vehicleId: proposal.vehicleId, isActive: true },
      select: { dtcCode: true },
    });
    const previousCodes = new Set(previousActive.map((e) => e.dtcCode));
    const newCodeSet = new Set(proposal.codes);

    const producerContext = {
      sourceProvider: 'DIMO' as const,
      sourceTimestamp: proposal.sourceObservedAt,
      organizationId: proposal.organizationId,
    };

    const upserted: string[] = [];
    const cleared: string[] = [];

    for (const code of proposal.codes) {
      await this.dtcService.upsertDtc(proposal.vehicleId, code, {
        producerContext,
        episodeOccurrenceSemantics: true,
        sourceObservedAt: proposal.sourceObservedAt,
      });
      upserted.push(code);
    }

    if (decision.allowClears) {
      for (const code of previousCodes) {
        if (!newCodeSet.has(code)) {
          await this.dtcService.clearDtc(proposal.vehicleId, code, { producerContext });
          cleared.push(code);
        }
      }
    }

    const rawPayloadJson = mergeDtcSnapshotMeta(latest?.rawPayloadJson, {
      lastAcceptedSourceAtMs: proposal.sourceObservedAt.getTime(),
      lastAcceptedCodesHash: proposal.codesContentHash,
      lastAcceptedBindingId: proposal.binding.providerBindingId,
      lastFetchAtMs: proposal.fetchObservedAt.getTime(),
      lastDecisionOutcome: decision.outcome,
      lastDecisionAtMs: Date.now(),
    });

    await this.prisma.vehicleLatestState.updateMany({
      where: { vehicleId: proposal.vehicleId },
      data: {
        obdDtcList: proposal.codes,
        lastDtcPollAt: proposal.fetchObservedAt,
        lastDtcSuccessfulCheckAt: proposal.fetchObservedAt,
        dtcPollStatus: 'success',
        dtcPollError: null,
        providerSource: 'DIMO',
        providerFetchedAt: proposal.fetchObservedAt,
        sourceTimestamp: proposal.sourceObservedAt,
        providerBindingId: proposal.binding.providerBindingId,
        syncJobRef: proposal.auditRef,
        rawPayloadJson: rawPayloadJson as Prisma.InputJsonValue,
      },
    });

    await this.emitNotificationsIfNeeded(
      proposal.vehicleId,
      previousCodes,
      newCodeSet,
      cleared,
      proposal.auditRef,
    );

    this.logger.log(
      `DTC-01A applied vehicle=${proposal.vehicleId} outcome=${decision.outcome} upserts=${upserted.length} clears=${cleared.length} ref=${proposal.auditRef}`,
    );

    return { decision, upserted, cleared };
  }

  private async persistDecisionOnly(
    proposal: DtcSnapshotProposal,
    decision: DtcSnapshotDecision,
  ): Promise<void> {
    const existing = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId: proposal.vehicleId },
      select: { rawPayloadJson: true },
    });
    const rawPayloadJson = mergeDtcSnapshotMeta(existing?.rawPayloadJson, {
      lastFetchAtMs: proposal.fetchObservedAt.getTime(),
      lastDecisionOutcome: decision.outcome,
      lastDecisionAtMs: Date.now(),
    });
    await this.prisma.vehicleLatestState.updateMany({
      where: { vehicleId: proposal.vehicleId },
      data: {
        lastDtcPollAt: proposal.fetchObservedAt,
        dtcPollError:
          decision.outcome === 'NOOP_ALREADY_APPLIED'
            ? null
            : decision.reasons.join(';').slice(0, 500),
        dtcPollStatus:
          decision.outcome === 'NOOP_ALREADY_APPLIED' ? 'success' : 'rejected_snapshot',
        rawPayloadJson: rawPayloadJson as Prisma.InputJsonValue,
        providerFetchedAt: proposal.fetchObservedAt,
        syncJobRef: proposal.auditRef,
      },
    });
  }

  private async emitNotificationsIfNeeded(
    vehicleId: string,
    previousCodes: Set<string>,
    newCodeSet: Set<string>,
    cleared: string[],
    auditRef: string,
  ): Promise<void> {
    if (!this.notificationIngest) return;
    if (cleared.length === 0 && previousCodes.size === newCodeSet.size) {
      const same = [...previousCodes].every((c) => newCodeSet.has(c));
      if (same) return;
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true, licensePlate: true, make: true, model: true },
    });
    if (!vehicle?.organizationId) return;

    const label =
      vehicle.licensePlate?.trim() ||
      `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
      vehicleId;

    const activeDtcs = await this.dtcService.findActive(vehicleId);
    const sources: VehicleHealthAdapterSource[] = activeDtcs.map((dtc) => {
      const band = normalizeDtcSeverityBand(dtc.severity);
      return {
        eventType: 'ACTIVE_DTC',
        vehicleId,
        label,
        code: dtc.dtcCode,
        reason: dtc.description ?? undefined,
        severity: band === 'critical' ? 'critical' : 'warning',
      };
    });

    for (const code of cleared) {
      sources.push({
        eventType: 'ACTIVE_DTC',
        vehicleId,
        label,
        code,
        cleared: true,
      });
    }

    try {
      await this.notificationIngest.ingestVehicleHealthSources(
        vehicle.organizationId,
        auditRef,
        sources,
      );
    } catch (err) {
      this.logger.warn(
        `DTC-01A notification ingest failed vehicle=${vehicleId}: ${(err as Error).message}`,
      );
    }
  }
}
