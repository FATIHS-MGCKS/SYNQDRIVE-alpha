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
import { DtcSnapshotApplyService } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-apply.service';
import { evaluateDtcPollEligibility } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-eligibility';
import { buildPollSignalsLatestProposal } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-proposal.builder';
import { resolveActiveDimoBindingForVehicle } from '@modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-binding.util';

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
  ) {
    super();
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

    if (!canEnqueueQueue(this.logger, 'dtc-poll-fanout')) return;

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
    let enqueued = 0;
    const dtc01a = isDtc01aSafetyFoundationEnabled();

    for (const vehicle of vehicles) {
      const tokenId = vehicle.dimoVehicle?.tokenId;
      if (!tokenId) continue;

      if (dtc01a) {
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
    }

    this.logger.log(
      `DTC fan-out enqueued ${enqueued}/${vehicles.length} per-vehicle jobs (bucket=${pollBucket})`,
    );
  }

  private async pollVehicleDtc(vehicleId: string, tokenId: number): Promise<void> {
    const fetchObservedAt = new Date();
    const auditRef = `dtc-poll:${vehicleId}:${fetchObservedAt.getTime()}`;

    if (isDtc01aSafetyFoundationEnabled()) {
      await this.pollVehicleDtc01a(vehicleId, tokenId, fetchObservedAt, auditRef);
      return;
    }

    await this.pollVehicleDtcLegacy(vehicleId, tokenId, fetchObservedAt);
  }

  private async pollVehicleDtc01a(
    vehicleId: string,
    tokenId: number,
    fetchObservedAt: Date,
    auditRef: string,
  ): Promise<void> {
    if (!this.dtcSnapshotApply) {
      this.logger.warn('DTC-01A enabled but DtcSnapshotApplyService missing — skipping poll');
      return;
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        registryLifecycle: true,
        dimoVehicleId: true,
      },
    });
    if (!vehicle) return;

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
      await this.dtcSnapshotApply.recordSkippedPoll({
        vehicleId,
        fetchObservedAt,
        reason: eligibility.reason,
        auditRef,
      });
      return;
    }

    try {
      const jwt = await this.auth.getVehicleJwt(tokenId);
      if (!jwt) {
        await this.dtcSnapshotApply.recordRejectedFetchMetadata({
          vehicleId,
          fetchObservedAt,
          pollStatus: 'failure',
          pollError: 'NO_VEHICLE_JWT',
          auditRef,
        });
        return;
      }

      const query = `
        query {
          signalsLatest(tokenId: ${tokenId}) {
            obdDTCList { timestamp value }
          }
        }
      `;
      const result = await this.telemetry.queryGraphQL(jwt, query, undefined, {
        organizationId: vehicle.organizationId,
        vehicleId,
        tokenId,
      });

      const binding = await resolveActiveDimoBindingForVehicle(
        this.prisma,
        vehicleId,
        tokenId,
      );
      if (!binding) {
        await this.dtcSnapshotApply.recordRejectedFetchMetadata({
          vehicleId,
          fetchObservedAt,
          pollStatus: 'failure',
          pollError: 'NO_ACTIVE_DIMO_BINDING',
          auditRef,
        });
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
        await this.dtcSnapshotApply.recordRejectedFetchMetadata({
          vehicleId,
          fetchObservedAt,
          pollStatus: 'rejected_snapshot',
          pollError: `${built.outcome}:${built.reason}`,
          auditRef,
        });
        return;
      }

      await this.dtcSnapshotApply.applyBuiltProposal(built);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const is403 = errorMessage.includes('403');
      await this.dtcSnapshotApply.recordRejectedFetchMetadata({
        vehicleId,
        fetchObservedAt,
        pollStatus: is403 ? 'auth_denied' : 'failure',
        pollError: errorMessage.slice(0, 500),
        auditRef,
      });
      this.logger.warn(`DTC-01A poll failed vehicleId=${vehicleId} error=${errorMessage}`);
    }
  }

  private async pollVehicleDtcLegacy(
    vehicleId: string,
    tokenId: number,
    now: Date,
  ): Promise<void> {
    try {
      const jwt = await this.auth.getVehicleJwt(tokenId);
      if (!jwt) {
        this.logger.warn(`No Vehicle JWT for vehicleId=${vehicleId}`);
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
      const result = await this.telemetry.queryGraphQL(jwt, query, undefined, {
        organizationId: vehicle?.organizationId,
        vehicleId,
        tokenId,
      });

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

      this.logger.debug(
        `DTC poll success: vehicleId=${vehicleId} active=${newCodes.length}`,
      );
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);

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
