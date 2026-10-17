import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
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
import {
  enqueueDtcSnapshotOutbox,
  flushDtcSnapshotOutbox,
} from './dtc-snapshot-outbox.flush';
import type { DtcSnapshotOutboxPayload } from './dtc-snapshot-outbox.types';
import { isDtc01aSafetyFoundationEnabled } from './dtc-01a.config';
import { Dtc02ObservabilityService } from '../observability/dtc02-observability.service';

export interface DtcSnapshotApplyResult {
  decision: DtcSnapshotDecision;
  upserted: string[];
  cleared: string[];
  skippedReason?: string;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class DtcSnapshotApplyService implements OnModuleInit {
  private readonly logger = new Logger(DtcSnapshotApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dtcService: DtcService,
    @Optional() private readonly notificationIngest?: NotificationProducerIngestService,
    @Optional() private readonly dtc02Observability?: Dtc02ObservabilityService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isDtc01aSafetyFoundationEnabled()) return;
    try {
      const { processed, failed } = await this.recoverPendingOutbox();
      if (processed > 0 || failed > 0) {
        this.logger.log(
          `DTC outbox startup recovery processed=${processed} failed=${failed}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `DTC outbox startup recovery skipped: ${(err as Error).message}`,
      );
    }
  }

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
    let decision!: DtcSnapshotDecision;
    let upserted: string[] = [];
    let cleared: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.acquireVehicleLock(tx, proposal.vehicleId);

      const headRow = await tx.vehicleDtcSourceHead.findUnique({
        where: { vehicleId: proposal.vehicleId },
      });
      const previousActive = await tx.vehicleDtcEvent.findMany({
        where: { vehicleId: proposal.vehicleId, isActive: true },
        select: { dtcCode: true },
      });
      const previousCodes = new Set(previousActive.map((e) => e.dtcCode));

      const head = mapSourceHeadRow(headRow);
      decision = evaluateDtcSnapshotDecision(head, proposal, {
        activeDtcCodes: previousCodes,
      });

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
        this.observeWebhookSnapshotApply(proposal, decision.outcome);
        return;
      }

      const newCodeSet = new Set(proposal.codes);

      const producerContext = {
        sourceProvider: 'DIMO' as const,
        sourceTimestamp: proposal.sourceObservedAt,
        organizationId: proposal.organizationId,
      };

      upserted = [];
      cleared = [];

      const upsertedEvents: Array<{ code: string; eventId: string }> = [];
      if (decision.allowUpserts) {
        for (const code of proposal.codes) {
          const event = await this.dtcService.upsertDtc(proposal.vehicleId, code, {
            producerContext,
            episodeOccurrenceSemantics: true,
            sourceObservedAt: proposal.sourceObservedAt,
            prisma: tx,
            deferDownstreamSideEffects: true,
          });
          upserted.push(code);
          upsertedEvents.push({ code, eventId: event.id });
        }
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
          }
        }
      }

      const nextEpoch =
        decision.outcome === 'APPLY_BINDING_REBASELINE'
          ? (headRow?.bindingEpoch ?? head.bindingEpoch) + 1
          : headRow?.bindingEpoch ?? head.bindingEpoch ?? 1;

      const isConfirmedComplete =
        (proposal.completeness === 'signals_latest_complete' ||
          proposal.completeness === 'webhook_provider_confirmed_complete') &&
        (decision.outcome === 'APPLY_CONFIRMED_SNAPSHOT' ||
          decision.outcome === 'APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS' ||
          decision.outcome === 'APPLY_BINDING_REBASELINE' ||
          decision.outcome === 'REFRESH_SOURCE_WATERMARK');

      const isPartialWebhook = proposal.completeness === 'webhook_partial_upsert_only';
      const isDeferClears = decision.outcome === 'APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS';
      const isWatermarkRefresh = decision.outcome === 'REFRESH_SOURCE_WATERMARK';

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
          ...(isConfirmedComplete
            ? { lastAcceptedCodesHash: proposal.codesContentHash }
            : {}),
          lastConfirmedCompleteSourceAt: isConfirmedComplete
            ? proposal.sourceObservedAt
            : headRow?.lastConfirmedCompleteSourceAt ?? null,
          lastConfirmedCompleteFetchAt: isConfirmedComplete
            ? proposal.fetchObservedAt
            : headRow?.lastConfirmedCompleteFetchAt ?? null,
          ...(isConfirmedComplete ? { confirmedObdCodes: proposal.codes } : {}),
          ...(isPartialWebhook
            ? {
                lastPartialWebhookSourceAt: proposal.sourceObservedAt,
                lastPartialWebhookCodesHash: proposal.codesContentHash,
              }
            : {}),
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
          ...(isConfirmedComplete
            ? {
                lastAcceptedCodesHash: proposal.codesContentHash,
                lastConfirmedCompleteSourceAt: proposal.sourceObservedAt,
                lastConfirmedCompleteFetchAt: proposal.fetchObservedAt,
                confirmedObdCodes: proposal.codes,
              }
            : {}),
          ...(isPartialWebhook
            ? {
                lastPartialWebhookSourceAt: proposal.sourceObservedAt,
                lastPartialWebhookCodesHash: proposal.codesContentHash,
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
      if (isConfirmedComplete && !isDeferClears) {
        vlsPatch.obdDtcList = proposal.codes;
        vlsPatch.lastDtcSuccessfulCheckAt = proposal.fetchObservedAt;
      } else if (isDeferClears) {
        vlsPatch.obdDtcList = [...previousCodes];
      } else if (isWatermarkRefresh) {
        // Poll metadata only — preserve operational DTC list.
      } else if (upserted.length > 0) {
        const merged = new Set([...previousCodes, ...upserted]);
        for (const c of cleared) merged.delete(c);
        vlsPatch.obdDtcList = [...merged];
      }

      await tx.vehicleLatestState.updateMany({
        where: { vehicleId: proposal.vehicleId },
        data: vlsPatch,
      });

      if (!proposal.organizationId) {
        return;
      }

      for (const { code, eventId } of upsertedEvents) {
        await enqueueDtcSnapshotOutbox(tx, {
          vehicleId: proposal.vehicleId,
          organizationId: proposal.organizationId,
          idempotencyKey: `dtc01c:downstream:${proposal.auditRef}:upsert:${code}`,
          payload: {
            kind: 'downstream_episode',
            vehicleId: proposal.vehicleId,
            dtcCode: code,
            episodeKind: 'upsert',
            eventId,
            producerContext,
          },
        });
      }

      for (const code of cleared) {
        await enqueueDtcSnapshotOutbox(tx, {
          vehicleId: proposal.vehicleId,
          organizationId: proposal.organizationId,
          idempotencyKey: `dtc01c:downstream:${proposal.auditRef}:clear:${code}`,
          payload: {
            kind: 'downstream_episode',
            vehicleId: proposal.vehicleId,
            dtcCode: code,
            episodeKind: 'clear',
            producerContext,
          },
        });
      }

      const notificationPayload = await this.buildNotificationPayload(
        tx,
        proposal,
        previousCodes,
        newCodeSet,
        cleared,
        upserted,
      );
      if (notificationPayload) {
        await enqueueDtcSnapshotOutbox(tx, {
          vehicleId: proposal.vehicleId,
          organizationId: proposal.organizationId,
          idempotencyKey: `dtc01c:notify:${proposal.auditRef}:${decision.outcome}`,
          payload: notificationPayload,
        });
      }
    });

    await this.recoverPendingOutbox(proposal.vehicleId);

    this.logger.log(
      `DTC-01C applied vehicle=${proposal.vehicleId} outcome=${decision.outcome} upserts=${upserted.length} clears=${cleared.length} ref=${proposal.auditRef}`,
    );

    this.observeWebhookSnapshotApply(proposal, decision.outcome);

    return { decision, upserted, cleared };
  }

  private observeWebhookSnapshotApply(
    proposal: DtcSnapshotProposal,
    outcome: string,
  ): void {
    if (!proposal.auditRef.startsWith('dtc-webhook:')) {
      return;
    }
    this.dtc02Observability?.recordPollOutcome('safety01a', outcome);
    const evidence =
      proposal.completeness === 'webhook_partial_upsert_only'
        ? 'partial'
        : proposal.completeness === 'signals_latest_complete' ||
            proposal.completeness === 'webhook_provider_confirmed_complete'
          ? 'complete'
          : 'unknown';
    this.dtc02Observability?.recordWebhookEvidence(evidence);
    this.dtc02Observability?.recordWebhookPhase('processed');
  }

  /** Idempotent delivery for downstream + notification intents (crash/restart safe). */
  async recoverPendingOutbox(vehicleId?: string): Promise<{ processed: number; failed: number }> {
    return flushDtcSnapshotOutbox({
      prisma: this.prisma,
      dtcService: this.dtcService,
      notificationIngest: this.notificationIngest,
      vehicleId,
      logger: this.logger,
    });
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
    upserted: string[],
  ): Promise<DtcSnapshotOutboxPayload | null> {
    const newCodes = upserted.filter((c) => !previousCodes.has(c));
    if (cleared.length === 0 && newCodes.length === 0) {
      return null;
    }
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

    return {
      kind: 'vehicle_health',
      organizationId: vehicle.organizationId,
      auditRef: proposal.auditRef,
      sources,
    };
  }
}
