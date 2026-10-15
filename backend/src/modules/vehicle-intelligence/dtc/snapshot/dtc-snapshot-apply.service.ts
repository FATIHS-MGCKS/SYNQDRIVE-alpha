import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../dtc.service';
import { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import { normalizeDtcSeverityBand } from '../dtc-severity.util';
import type { VehicleHealthAdapterSource } from '@modules/notifications/adapters/notification-adapter.types';
import { evaluateDtcSnapshotDecision } from './dtc-snapshot-decision';
import { dtcSnapshotAdvisoryLockKey } from './dtc-advisory-lock.util';
import { mapSourceHeadRow } from './dtc-source-head.mapper';
import type { DtcSnapshotDecision, DtcSnapshotProposal } from './dtc-snapshot.types';
import type { DtcSnapshotProposalBuildResult } from './dtc-snapshot-proposal.builder';

export interface DtcSnapshotApplyResult {
  decision: DtcSnapshotDecision;
  upserted: string[];
  cleared: string[];
  skippedReason?: string;
}

type Tx = Prisma.TransactionClient;

interface NotificationOutboxPayload {
  kind: 'vehicle_health';
  organizationId: string;
  auditRef: string;
  sources: VehicleHealthAdapterSource[];
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
    organizationId?: string | null;
    fetchObservedAt: Date;
    pollStatus: string;
    pollError: string;
    auditRef: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.acquireVehicleLock(tx, input.vehicleId);
      await this.touchHeadPollMeta(tx, {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId ?? null,
        fetchObservedAt: input.fetchObservedAt,
        pollStatus: input.pollStatus,
        pollError: input.pollError,
        decisionOutcome: input.pollStatus,
        auditRef: input.auditRef,
      });
      await this.patchVlsDtcOnly(tx, input.vehicleId, {
        lastDtcPollAt: input.fetchObservedAt,
        dtcPollStatus: input.pollStatus,
        dtcPollError: input.pollError.slice(0, 500),
      });
    });
    this.logger.log(
      `DTC-01B rejected fetch metadata vehicle=${input.vehicleId} ref=${input.auditRef} status=${input.pollStatus}`,
    );
  }

  async recordSkippedPoll(input: {
    vehicleId: string;
    organizationId?: string | null;
    fetchObservedAt: Date;
    reason: string;
    auditRef: string;
  }): Promise<void> {
    await this.recordRejectedFetchMetadata({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
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
    const deferred: Array<
      | { kind: 'upsert'; code: string; eventId: string }
      | { kind: 'clear'; code: string }
    > = [];
    let decision!: DtcSnapshotDecision;
    let upserted: string[] = [];
    let cleared: string[] = [];
    let notificationPayload: NotificationOutboxPayload | null = null;

    await this.prisma.$transaction(async (tx) => {
      await this.acquireVehicleLock(tx, proposal.vehicleId);

      const headRow = await tx.vehicleDtcSourceHead.findUnique({
        where: { vehicleId: proposal.vehicleId },
      });
      const head = mapSourceHeadRow(headRow);
      decision = evaluateDtcSnapshotDecision(head, proposal);

      if (!decision.apply) {
        await this.touchHeadPollMeta(tx, {
          vehicleId: proposal.vehicleId,
          organizationId: proposal.organizationId,
          fetchObservedAt: proposal.fetchObservedAt,
          pollStatus:
            decision.outcome === 'NOOP_ALREADY_APPLIED' ? 'success' : 'rejected_snapshot',
          pollError:
            decision.outcome === 'NOOP_ALREADY_APPLIED'
              ? null
              : decision.reasons.join(';').slice(0, 500),
          decisionOutcome: decision.outcome,
          auditRef: proposal.auditRef,
          binding: proposal.binding,
        });
        await this.patchVlsDtcOnly(tx, proposal.vehicleId, {
          lastDtcPollAt: proposal.fetchObservedAt,
          dtcPollStatus:
            decision.outcome === 'NOOP_ALREADY_APPLIED' ? 'success' : 'rejected_snapshot',
          dtcPollError:
            decision.outcome === 'NOOP_ALREADY_APPLIED'
              ? null
              : decision.reasons.join(';').slice(0, 500),
        });
        return;
      }

      const previousActive = await tx.vehicleDtcEvent.findMany({
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

      upserted = [];
      cleared = [];

      for (const code of proposal.codes) {
        const event = await this.dtcService.upsertDtc(proposal.vehicleId, code, {
          producerContext,
          episodeOccurrenceSemantics: true,
          sourceObservedAt: proposal.sourceObservedAt,
          prisma: tx,
          deferDownstreamSideEffects: true,
        });
        upserted.push(code);
        deferred.push({ kind: 'upsert', code, eventId: event.id });
      }

      if (decision.allowClears) {
        for (const code of previousCodes) {
          if (!newCodeSet.has(code)) {
            await this.dtcService.clearDtc(proposal.vehicleId, code, {
              producerContext,
              prisma: tx,
              deferDownstreamSideEffects: true,
            });
            cleared.push(code);
            deferred.push({ kind: 'clear', code });
          }
        }
      }

      const nextEpoch =
        decision.outcome === 'APPLY_BINDING_REBASELINE'
          ? (headRow?.bindingEpoch ?? head.bindingEpoch) + 1
          : headRow?.bindingEpoch ?? head.bindingEpoch ?? 1;

      const isConfirmedComplete =
        proposal.completeness === 'signals_latest_complete' &&
        (decision.outcome === 'APPLY_CONFIRMED_SNAPSHOT' ||
          decision.outcome === 'APPLY_BINDING_REBASELINE');

      await tx.vehicleDtcSourceHead.upsert({
        where: { vehicleId: proposal.vehicleId },
        create: {
          vehicleId: proposal.vehicleId,
          organizationId: proposal.organizationId,
          provider: 'DIMO',
          providerBindingId: proposal.binding.providerBindingId,
          bindingEpoch: nextEpoch,
          dimoTokenId: proposal.binding.dimoTokenId,
          lastAcceptedSourceAt: proposal.sourceObservedAt,
          lastAcceptedCodesHash: proposal.codesContentHash,
          lastConfirmedCompleteSourceAt: isConfirmedComplete
            ? proposal.sourceObservedAt
            : headRow?.lastConfirmedCompleteSourceAt ?? null,
          lastConfirmedCompleteFetchAt: isConfirmedComplete
            ? proposal.fetchObservedAt
            : headRow?.lastConfirmedCompleteFetchAt ?? null,
          ...(isConfirmedComplete ? { confirmedObdCodes: proposal.codes } : {}),
          lastPollFetchAt: proposal.fetchObservedAt,
          lastPollStatus: 'success',
          lastPollError: null,
          lastDecisionOutcome: decision.outcome,
          lastAuditRef: proposal.auditRef,
        },
        update: {
          organizationId: proposal.organizationId,
          providerBindingId: proposal.binding.providerBindingId,
          bindingEpoch: nextEpoch,
          dimoTokenId: proposal.binding.dimoTokenId,
          lastAcceptedSourceAt: proposal.sourceObservedAt,
          lastAcceptedCodesHash: proposal.codesContentHash,
          ...(isConfirmedComplete
            ? {
                lastConfirmedCompleteSourceAt: proposal.sourceObservedAt,
                lastConfirmedCompleteFetchAt: proposal.fetchObservedAt,
                confirmedObdCodes: proposal.codes,
              }
            : {}),
          lastPollFetchAt: proposal.fetchObservedAt,
          lastPollStatus: 'success',
          lastPollError: null,
          lastDecisionOutcome: decision.outcome,
          lastAuditRef: proposal.auditRef,
        },
      });

      const vlsPatch: Prisma.VehicleLatestStateUpdateManyMutationInput = {
        lastDtcPollAt: proposal.fetchObservedAt,
        dtcPollStatus: 'success',
        dtcPollError: null,
      };
      if (isConfirmedComplete) {
        vlsPatch.obdDtcList = proposal.codes;
        vlsPatch.lastDtcSuccessfulCheckAt = proposal.fetchObservedAt;
      } else if (upserted.length > 0) {
        const merged = new Set([...previousCodes, ...upserted]);
        for (const c of cleared) merged.delete(c);
        vlsPatch.obdDtcList = [...merged];
      }

      await tx.vehicleLatestState.updateMany({
        where: { vehicleId: proposal.vehicleId },
        data: vlsPatch,
      });

      if (proposal.organizationId && (cleared.length > 0 || upserted.length > 0)) {
        notificationPayload = await this.buildNotificationPayload(
          tx,
          proposal,
          previousCodes,
          newCodeSet,
          cleared,
        );
        if (notificationPayload) {
          await tx.vehicleDtcSnapshotOutbox.create({
            data: {
              vehicleId: proposal.vehicleId,
              organizationId: proposal.organizationId,
              idempotencyKey: `dtc01b:${proposal.auditRef}:${decision.outcome}`,
              payload: notificationPayload as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
    });

    const producerContext = {
      sourceProvider: 'DIMO' as const,
      sourceTimestamp: proposal.sourceObservedAt,
      organizationId: proposal.organizationId,
    };
    for (const item of deferred) {
      if (item.kind === 'upsert') {
        const event = await this.prisma.vehicleDtcEvent.findUnique({
          where: { id: item.eventId },
        });
        await this.dtcService.runEpisodeSideEffectsAfterCommit(
          proposal.vehicleId,
          item.code,
          'upsert',
          producerContext,
          event ?? undefined,
        );
      } else {
        await this.dtcService.runEpisodeSideEffectsAfterCommit(
          proposal.vehicleId,
          item.code,
          'clear',
          producerContext,
        );
      }
    }

    await this.flushOutboxForVehicle(proposal.vehicleId);

    this.logger.log(
      `DTC-01B applied vehicle=${proposal.vehicleId} outcome=${decision.outcome} upserts=${upserted.length} clears=${cleared.length} ref=${proposal.auditRef}`,
    );

    return { decision, upserted, cleared };
  }

  async flushOutboxForVehicle(vehicleId: string): Promise<void> {
    if (!this.notificationIngest) return;

    const pending = await this.prisma.vehicleDtcSnapshotOutbox.findMany({
      where: { vehicleId, processedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const row of pending) {
      const payload = row.payload as unknown as NotificationOutboxPayload;
      if (payload?.kind !== 'vehicle_health') {
        await this.prisma.vehicleDtcSnapshotOutbox.update({
          where: { id: row.id },
          data: { processedAt: new Date(), lastError: 'UNKNOWN_PAYLOAD_KIND' },
        });
        continue;
      }
      try {
        await this.notificationIngest.ingestVehicleHealthSources(
          payload.organizationId,
          payload.auditRef,
          payload.sources,
        );
        await this.prisma.vehicleDtcSnapshotOutbox.update({
          where: { id: row.id },
          data: { processedAt: new Date(), lastError: null },
        });
      } catch (err) {
        await this.prisma.vehicleDtcSnapshotOutbox.update({
          where: { id: row.id },
          data: { lastError: (err as Error).message.slice(0, 500) },
        });
        this.logger.warn(
          `DTC-01B outbox flush failed vehicle=${vehicleId}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async acquireVehicleLock(tx: Tx, vehicleId: string): Promise<void> {
    const key = dtcSnapshotAdvisoryLockKey(vehicleId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
  }

  private async touchHeadPollMeta(
    tx: Tx,
    input: {
      vehicleId: string;
      organizationId: string | null;
      fetchObservedAt: Date;
      pollStatus: string;
      pollError: string | null;
      decisionOutcome: string;
      auditRef: string;
      binding?: DtcSnapshotProposal['binding'];
    },
  ): Promise<void> {
    const existing = await tx.vehicleDtcSourceHead.findUnique({
      where: { vehicleId: input.vehicleId },
    });
    if (!existing && !input.binding) {
      return;
    }
    await tx.vehicleDtcSourceHead.upsert({
      where: { vehicleId: input.vehicleId },
      create: {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        provider: 'DIMO',
        providerBindingId: input.binding!.providerBindingId,
        bindingEpoch: 1,
        dimoTokenId: input.binding!.dimoTokenId,
        lastPollFetchAt: input.fetchObservedAt,
        lastPollStatus: input.pollStatus,
        lastPollError: input.pollError,
        lastDecisionOutcome: input.decisionOutcome,
        lastAuditRef: input.auditRef,
      },
      update: {
        lastPollFetchAt: input.fetchObservedAt,
        lastPollStatus: input.pollStatus,
        lastPollError: input.pollError,
        lastDecisionOutcome: input.decisionOutcome,
        lastAuditRef: input.auditRef,
      },
    });
  }

  private async patchVlsDtcOnly(
    tx: Tx,
    vehicleId: string,
    data: Prisma.VehicleLatestStateUpdateManyMutationInput,
  ): Promise<void> {
    await tx.vehicleLatestState.updateMany({
      where: { vehicleId },
      data,
    });
  }

  private async buildNotificationPayload(
    tx: Tx,
    proposal: DtcSnapshotProposal,
    previousCodes: Set<string>,
    newCodeSet: Set<string>,
    cleared: string[],
  ): Promise<NotificationOutboxPayload | null> {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: proposal.vehicleId },
      select: { organizationId: true, licensePlate: true, make: true, model: true },
    });
    if (!vehicle?.organizationId) return null;

    const label =
      vehicle.licensePlate?.trim() ||
      `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
      proposal.vehicleId;

    const activeDtcs = await tx.vehicleDtcEvent.findMany({
      where: { vehicleId: proposal.vehicleId, isActive: true },
      select: { dtcCode: true, description: true, severity: true },
    });

    const sources: VehicleHealthAdapterSource[] = activeDtcs.map((dtc) => {
      const band = normalizeDtcSeverityBand(dtc.severity);
      return {
        eventType: 'ACTIVE_DTC',
        vehicleId: proposal.vehicleId,
        label,
        code: dtc.dtcCode,
        reason: dtc.description ?? undefined,
        severity: band === 'critical' ? 'critical' : 'warning',
      };
    });

    for (const code of cleared) {
      sources.push({
        eventType: 'ACTIVE_DTC',
        vehicleId: proposal.vehicleId,
        label,
        code,
        cleared: true,
      });
    }

    if (cleared.length === 0 && previousCodes.size === newCodeSet.size) {
      const same = [...previousCodes].every((c) => newCodeSet.has(c));
      if (same && upsertedOnlyNew(previousCodes, newCodeSet).length === 0) {
        return null;
      }
    }

    return {
      kind: 'vehicle_health',
      organizationId: vehicle.organizationId,
      auditRef: proposal.auditRef,
      sources,
    };
  }
}

function upsertedOnlyNew(previous: Set<string>, next: Set<string>): string[] {
  return [...next].filter((c) => !previous.has(c));
}
