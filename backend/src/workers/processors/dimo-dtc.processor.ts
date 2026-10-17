import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTelemetryService } from '../../modules/dimo/dimo-telemetry.service';
import { DimoAuthService } from '../../modules/dimo/dimo-auth.service';
import { DtcService } from '../../modules/vehicle-intelligence/dtc/dtc.service';
import { normalizeDtcCodes } from '../../modules/vehicle-intelligence/dtc/dtc-code-normalizer.util';
import { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import { normalizeDtcSeverityBand } from '@modules/vehicle-intelligence/dtc/dtc-severity.util';
import type { VehicleHealthAdapterSource } from '@modules/notifications/adapters/notification-adapter.types';
import { QUEUE_NAMES } from '../queues/queue-names';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { buildDtcPollVehicleJobId } from './dimo-dtc-queue.util';
import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';
import { isDtc01aSafetyFoundationEnabled } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-01a.config';
import {
  evaluateDtcPollJobAdmission,
  logDtc01fCohortConfigOnBoot,
} from '@modules/vehicle-intelligence/dtc/snapshot/dtc-01f-cohort-gate';
import { DtcSnapshotApplyService } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-apply.service';
import { evaluateDtcPollEligibility } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-eligibility';
import { buildPollSignalsLatestProposal } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-proposal.builder';
import { resolveActiveDimoBindingForVehicle } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-binding.util';
import { requireDtcSnapshotApplyService } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-fail-closed';
import { Dtc02ObservabilityService } from '@modules/vehicle-intelligence/dtc/observability/dtc02-observability.service';
import { runDtc02AdaptiveSchedulerShadowBatch } from '@modules/vehicle-intelligence/dtc/adaptive/dtc-02-adaptive-shadow.runtime';
import { logDtc02AdaptiveSchedulerShadowConfigOnBoot } from '@modules/vehicle-intelligence/dtc/adaptive/dtc-02-adaptive-shadow.config';

// Supported job names on the DTC queue:
//   dtc-poll         — legacy full-fleet scan (still works, but fans out)
//   dtc-poll-vehicle — single-vehicle job produced by the fan-out
export const DTC_JOB_FANOUT = 'dtc-poll';
export const DTC_JOB_SINGLE = 'dtc-poll-vehicle';

@Processor(QUEUE_NAMES.DTC_POLL)
@Injectable()
export class DimoDtcProcessor extends WorkerHost {
  private readonly logger = new Logger(DimoDtcProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: DimoTelemetryService,
    private readonly auth: DimoAuthService,
    private readonly dtcService: DtcService,
    @InjectQueue(QUEUE_NAMES.DTC_POLL) private readonly queue: Queue,
    @Optional() private readonly notificationIngest?: NotificationProducerIngestService,
    @Optional() private readonly dtcSnapshotApply?: DtcSnapshotApplyService,
    @Optional() private readonly dtc02Observability?: Dtc02ObservabilityService,
  ) {
    super();
    logDtc01fCohortConfigOnBoot(this.logger);
    logDtc02AdaptiveSchedulerShadowConfigOnBoot(this.logger);
  }

  async process(job: Job): Promise<void> {
    if (job.name === DTC_JOB_SINGLE) {
      const vehicleId = job.data?.vehicleId as string | undefined;
      const tokenId = job.data?.tokenId as number | undefined;
      if (!vehicleId || !tokenId) {
        this.logger.warn(`Malformed dtc-poll-vehicle job: ${JSON.stringify(job.data)}`);
        return;
      }
      await runWithDimoRequestContext(
        { category: 'HEALTH', priority: 'LOW' },
        () => this.pollVehicleDtc(vehicleId, tokenId),
      );
      return;
    }

    if (!canEnqueueQueue(this.logger, 'dtc-poll-fanout')) {
      this.dtc02Observability?.recordSchedulerTick('skipped_backpressure');
      return;
    }

    this.dtc02Observability?.recordSchedulerTick('success');
    this.logger.log('Starting DTC poll fan-out');

    const vehicles = await this.prisma.vehicle.findMany({
      where: { dimoVehicle: { isNot: null } },
      select: {
        id: true,
        registryLifecycle: true,
        dimoVehicleId: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    const pollBucket = Math.floor(Date.now() / (3 * 3600_000));
    const evaluatedAtMs = Date.now();
    let enqueued = 0;
    const shadowCandidateIds: string[] = [];

    for (const vehicle of vehicles) {
      const tokenId = vehicle.dimoVehicle?.tokenId;
      if (!tokenId) {
        this.dtc02Observability?.recordFanOutSkip('MISSING_DIMO_TOKEN');
        continue;
      }

      const admission = evaluateDtcPollJobAdmission({
        vehicleId: vehicle.id,
        registryLifecycle: vehicle.registryLifecycle,
      });
      if (!admission.enqueue) {
        this.dtc02Observability?.recordFanOutSkip(admission.reason);
        this.logger.debug(
          `DTC fan-out skip vehicle=${vehicle.id} reason=${admission.reason}`,
        );
        continue;
      }

      if (admission.runtimePath === 'safety01a') {
        const link = await this.prisma.vehicleDataSourceLink.findFirst({
          where: { vehicleId: vehicle.id, provider: 'DIMO', isActive: true },
          select: { id: true, isActive: true, dimoVehicleId: true },
        });
        const eligibility = evaluateDtcPollEligibility({
          registryLifecycle: vehicle.registryLifecycle,
          dimoTokenId: tokenId,
          activeDimoLink: link,
          vehicleDimoVehicleId: vehicle.dimoVehicleId,
        });
        if (!eligibility.eligible) {
          this.dtc02Observability?.recordFanOutSkip(
            `POLL_INELIGIBLE:${eligibility.reason}`,
          );
          this.logger.debug(
            `DTC fan-out skip vehicle=${vehicle.id} reason=${eligibility.reason}`,
          );
          continue;
        }
      }

      await this.queue.add(
        DTC_JOB_SINGLE,
        { vehicleId: vehicle.id, tokenId },
        {
          jobId: buildDtcPollVehicleJobId(vehicle.id, pollBucket),
          removeOnComplete: { count: 100, age: 24 * 3600 },
          removeOnFail: { count: 500, age: 7 * 24 * 3600 },
        },
      );
      enqueued++;
      shadowCandidateIds.push(vehicle.id);
    }

    await runDtc02AdaptiveSchedulerShadowBatch({
      prisma: this.prisma,
      observability: this.dtc02Observability,
      candidateVehicleIds: shadowCandidateIds,
      evaluatedAtMs,
      logger: this.logger,
    });

    this.dtc02Observability?.recordFanOutEligible(vehicles.length, enqueued);
    void this.dtc02Observability?.refreshSourceTrustFromDb(this.prisma);

    this.logger.log(
      `DTC fan-out enqueued ${enqueued}/${vehicles.length} per-vehicle jobs (bucket=${pollBucket})`,
    );
  }

  private async pollVehicleDtc(vehicleId: string, tokenId: number): Promise<void> {
    const fetchObservedAt = new Date();
    const auditRef = `dtc-poll:${vehicleId}:${fetchObservedAt.getTime()}`;
    const started = Date.now();

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { registryLifecycle: true },
    });
    const admission = evaluateDtcPollJobAdmission({
      vehicleId,
      registryLifecycle: vehicle?.registryLifecycle,
    });
    if (!admission.enqueue) {
      this.dtc02Observability?.recordPollOutcome('unknown', 'skipped_admission');
      this.logger.warn(
        `DTC poll skip vehicle=${vehicleId} reason=${admission.reason} auditRef=${auditRef}`,
      );
      return;
    }
    const path = admission.runtimePath === 'safety01a' ? 'safety01a' : 'legacy';
    this.dtc02Observability?.recordPollAttempt(path);
    if (admission.runtimePath === 'safety01a') {
      await this.pollVehicleDtc01a(vehicleId, tokenId, fetchObservedAt, auditRef, started);
      return;
    }

    await this.pollVehicleDtcLegacy(vehicleId, tokenId, fetchObservedAt, started);
  }

  private async pollVehicleDtc01a(
    vehicleId: string,
    tokenId: number,
    fetchObservedAt: Date,
    auditRef: string,
    startedMs: number,
  ): Promise<void> {
    const snapshotApply = requireDtcSnapshotApplyService(
      this.dtcSnapshotApply,
      'DimoDtcProcessor.pollVehicleDtc01a',
    );

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        registryLifecycle: true,
        dimoVehicleId: true,
      },
    });
    if (!vehicle) {
      this.dtc02Observability?.recordPollOutcome('safety01a', 'skipped_ineligible');
      return;
    }

    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId, provider: 'DIMO', isActive: true },
      select: { id: true, isActive: true, dimoVehicleId: true },
    });
    const eligibility = evaluateDtcPollEligibility({
      registryLifecycle: vehicle.registryLifecycle,
      dimoTokenId: tokenId,
      activeDimoLink: link,
      vehicleDimoVehicleId: vehicle.dimoVehicleId,
    });
    if (!eligibility.eligible) {
      await snapshotApply.recordSkippedPoll({
        vehicleId,
        organizationId: vehicle.organizationId,
        fetchObservedAt,
        reason: eligibility.reason,
        auditRef,
      });
      this.dtc02Observability?.recordPollOutcome('safety01a', 'skipped_ineligible');
      this.dtc02Observability?.observePollDuration(
        'safety01a',
        'failure',
        (Date.now() - startedMs) / 1000,
      );
      return;
    }

    try {
      const jwt = await this.auth.getVehicleJwt(tokenId);
      if (!jwt) {
        await snapshotApply.recordRejectedFetchMetadata({
          vehicleId,
          fetchObservedAt,
          pollStatus: 'failure',
          pollError: 'NO_VEHICLE_JWT',
          auditRef,
        });
        this.dtc02Observability?.recordPollOutcome('safety01a', 'failure');
        this.dtc02Observability?.observePollDuration(
          'safety01a',
          'failure',
          (Date.now() - startedMs) / 1000,
        );
        return;
      }

      const query = `
        query {
          signalsLatest(tokenId: ${tokenId}) {
            obdDTCList { timestamp value }
          }
        }
      `;
      this.dtc02Observability?.recordProviderPollRequest('attempt');
      const result = await this.telemetry.queryGraphQL(jwt, query, undefined, {
        organizationId: vehicle.organizationId,
        vehicleId,
        tokenId,
      });
      this.dtc02Observability?.recordProviderPollRequest('success');

      const binding = await resolveActiveDimoBindingForVehicle(
        this.prisma,
        vehicleId,
        tokenId,
      );
      if (!binding) {
        await snapshotApply.recordRejectedFetchMetadata({
          vehicleId,
          fetchObservedAt,
          pollStatus: 'failure',
          pollError: 'NO_ACTIVE_DIMO_BINDING',
          auditRef,
        });
        this.dtc02Observability?.recordPollOutcome('safety01a', 'failure');
        this.dtc02Observability?.observePollDuration(
          'safety01a',
          'failure',
          (Date.now() - startedMs) / 1000,
        );
        return;
      }

      const dtcSignal = result?.data?.signalsLatest?.obdDTCList ?? null;
      const built = buildPollSignalsLatestProposal({
        vehicleId,
        organizationId: vehicle.organizationId,
        binding,
        fetchObservedAt,
        auditRef,
        obdDtcListSignal: dtcSignal,
      });

      if (!built.ok) {
        await snapshotApply.recordRejectedFetchMetadata({
          vehicleId,
          fetchObservedAt,
          pollStatus: 'rejected_snapshot',
          pollError: `${built.outcome}:${built.reason}`,
          auditRef,
        });
        this.dtc02Observability?.recordPollOutcome('safety01a', 'rejected_snapshot');
        this.dtc02Observability?.observePollDuration(
          'safety01a',
          'failure',
          (Date.now() - startedMs) / 1000,
        );
        return;
      }

      const applyResult = await snapshotApply.applyBuiltProposal(built);
      this.dtc02Observability?.recordPollOutcome('safety01a', applyResult.decision.outcome);
      this.dtc02Observability?.observePollDuration(
        'safety01a',
        'success',
        (Date.now() - startedMs) / 1000,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const is403 = errorMessage.includes('403');
      await snapshotApply.recordRejectedFetchMetadata({
        vehicleId,
        fetchObservedAt,
        pollStatus: is403 ? 'auth_denied' : 'failure',
        pollError: errorMessage.slice(0, 500),
        auditRef,
      });
      this.dtc02Observability?.recordProviderFailureAsOutcome('safety01a', errorMessage);
      this.dtc02Observability?.observePollDuration(
        'safety01a',
        'failure',
        (Date.now() - startedMs) / 1000,
      );
      this.logger.warn(`DTC-01A poll failed vehicleId=${vehicleId} error=${errorMessage}`);
    }
  }

  private async pollVehicleDtcLegacy(
    vehicleId: string,
    tokenId: number,
    now: Date,
    startedMs: number,
  ): Promise<void> {
    try {
      const jwt = await this.auth.getVehicleJwt(tokenId);
      if (!jwt) {
        this.logger.warn(`No Vehicle JWT for vehicleId=${vehicleId}`);
        this.dtc02Observability?.recordPollOutcome('legacy', 'failure');
        this.dtc02Observability?.observePollDuration(
          'legacy',
          'failure',
          (Date.now() - startedMs) / 1000,
        );
        return;
      }

      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { organizationId: true },
      });

      const query = `
        query {
          signalsLatest(tokenId: ${tokenId}) {
            obdDTCList { timestamp value }
          }
        }
      `;
      this.dtc02Observability?.recordProviderPollRequest('attempt');
      const result = await this.telemetry.queryGraphQL(jwt, query, undefined, {
        organizationId: vehicle?.organizationId,
        vehicleId,
        tokenId,
      });
      this.dtc02Observability?.recordProviderPollRequest('success');

      const dtcSignal = result?.data?.signalsLatest?.obdDTCList ?? null;
      const newCodes: string[] = normalizeDtcCodes(dtcSignal?.value);

      const previousActive = await this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId, isActive: true },
        select: { dtcCode: true },
      });
      const previousCodes = new Set(previousActive.map((e) => e.dtcCode));
      const newCodeSet = new Set(newCodes);

      const producerContext = {
        sourceProvider: 'DIMO' as const,
        sourceTimestamp: dtcSignal?.timestamp ? new Date(dtcSignal.timestamp) : now,
        organizationId: vehicle?.organizationId ?? null,
      };

      for (const code of newCodes) {
        await this.dtcService.upsertDtc(vehicleId, code, { producerContext });
      }

      for (const code of previousCodes) {
        if (!newCodeSet.has(code)) {
          await this.dtcService.clearDtc(vehicleId, code, { producerContext });
          this.logger.log(`DTC cleared: vehicleId=${vehicleId} code=${code}`);
        }
      }

      await this.prisma.vehicleLatestState.updateMany({
        where: { vehicleId },
        data: {
          obdDtcList: newCodes,
          lastDtcPollAt: now,
          lastDtcSuccessfulCheckAt: now,
          dtcPollStatus: 'success',
          dtcPollError: null,
        },
      });

      await this.emitDtcHealthNotifications(vehicleId, previousCodes, newCodeSet);

      this.dtc02Observability?.recordPollOutcome('legacy', 'legacy_success');
      this.dtc02Observability?.observePollDuration(
        'legacy',
        'success',
        (Date.now() - startedMs) / 1000,
      );

      this.logger.debug(
        `DTC poll success: vehicleId=${vehicleId} active=${newCodes.length}`,
      );
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.dtc02Observability?.recordProviderFailureAsOutcome('legacy', errorMessage);
      this.dtc02Observability?.observePollDuration(
        'legacy',
        'failure',
        (Date.now() - startedMs) / 1000,
      );

      this.logger.warn(`DTC poll failed: vehicleId=${vehicleId} error=${errorMessage}`);

      await this.prisma.vehicleLatestState
        .updateMany({
          where: { vehicleId },
          data: {
            lastDtcPollAt: now,
            dtcPollStatus: 'failure',
            dtcPollError: errorMessage.slice(0, 500),
          },
        })
        .catch((secondaryErr) => {
          const msg =
            secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr);
          this.logger.warn(
            `DTC poll-failure metadata update also failed: vehicleId=${vehicleId} error=${msg}`,
          );
        });
    }
  }

  private async emitDtcHealthNotifications(
    vehicleId: string,
    previousCodes: Set<string>,
    newCodeSet: Set<string>,
  ): Promise<void> {
    if (!this.notificationIngest) return;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true, licensePlate: true, make: true, model: true },
    });
    if (!vehicle) return;

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

    for (const code of previousCodes) {
      if (!newCodeSet.has(code)) {
        sources.push({
          eventType: 'ACTIVE_DTC',
          vehicleId,
          label,
          code,
          cleared: true,
        });
      }
    }

    try {
      await this.notificationIngest.ingestVehicleHealthSources(
        vehicle.organizationId,
        `dtc-poll:${vehicleId}`,
        sources,
      );
    } catch (err) {
      this.logger.warn(
        `DTC notification ingest failed for ${vehicleId}: ${(err as Error).message}`,
      );
    }
  }
}
