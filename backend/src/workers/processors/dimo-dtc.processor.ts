import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTelemetryService } from '../../modules/dimo/dimo-telemetry.service';
import { DimoAuthService } from '../../modules/dimo/dimo-auth.service';
import { DtcService } from '../../modules/vehicle-intelligence/dtc/dtc.service';
import { QUEUE_NAMES } from '../queues/queue-names';

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
      await this.pollVehicleDtc(vehicleId, tokenId);
      return;
    }

    // Fan-out: enqueue one dtc-poll-vehicle job per vehicle instead of processing
    // the full fleet inline. This keeps a single job from blocking the worker
    // and allows BullMQ concurrency + retry to handle per-vehicle failures.
    this.logger.log('Starting DTC poll fan-out');

    const vehicles = await this.prisma.vehicle.findMany({
      where: { dimoVehicle: { isNot: null } },
      select: { id: true, dimoVehicle: { select: { tokenId: true } } },
    });

    const pollBucket = Math.floor(Date.now() / (3 * 3600_000)); // 3h bucket aligned with scheduler
    let enqueued = 0;
    for (const vehicle of vehicles) {
      const tokenId = vehicle.dimoVehicle?.tokenId;
      if (!tokenId) continue;
      await this.queue.add(
        DTC_JOB_SINGLE,
        { vehicleId: vehicle.id, tokenId },
        {
          jobId: `dtc-poll:${vehicle.id}:${pollBucket}`,
          // Per-vehicle retention so a single flaky vehicle doesn't fill Redis.
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

  // ── Per-vehicle poll ───────────────────────────────────────────────

  private async pollVehicleDtc(
    vehicleId: string,
    tokenId: number,
  ): Promise<void> {
    const now = new Date();

    try {
      const jwt = await this.auth.getVehicleJwt(tokenId);
      if (!jwt) {
        this.logger.warn(`No Vehicle JWT for vehicleId=${vehicleId}`);
        return;
      }

      // Fetch latest obdDTCList signal via DIMO signalsLatest (SignalCollection format)
      const query = `
        query {
          signalsLatest(tokenId: ${tokenId}) {
            obdDTCList { timestamp value }
          }
        }
      `;
      const result = await this.telemetry.queryGraphQL(jwt, query);

      // SignalCollection returns obdDTCList as { timestamp, value } object, not a row array
      const dtcSignal = result?.data?.signalsLatest?.obdDTCList ?? null;

      // Normalize: DIMO may return a comma-joined string or an array
      const newCodes: string[] = this.normalizeDtcCodes(dtcSignal?.value);

      // ── Diff against currently-active codes ──────────────────────
      const previousActive = await this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId, isActive: true },
        select: { dtcCode: true },
      });
      const previousCodes = new Set(previousActive.map((e) => e.dtcCode));
      const newCodeSet = new Set(newCodes);

      // Upsert codes that are present in the new poll
      for (const code of newCodes) {
        await this.dtcService.upsertDtc(vehicleId, code);
      }

      // Clear codes that were active but are no longer present
      for (const code of previousCodes) {
        if (!newCodeSet.has(code)) {
          await this.dtcService.clearDtc(vehicleId, code);
          this.logger.log(
            `DTC cleared: vehicleId=${vehicleId} code=${code}`,
          );
        }
      }

      // ── Update latest state — success path ───────────────────────
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

      this.logger.debug(
        `DTC poll success: vehicleId=${vehicleId} active=${newCodes.length}`,
      );
    } catch (err: any) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      this.logger.warn(
        `DTC poll failed: vehicleId=${vehicleId} error=${errorMessage}`,
      );

      // On failure: record poll metadata only.
      // Do NOT touch DTC events or lastDtcSuccessfulCheckAt.
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
          const msg = secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr);
          this.logger.warn(
            `DTC poll-failure metadata update also failed: vehicleId=${vehicleId} error=${msg}`,
          );
        });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private normalizeDtcCodes(value: unknown): string[] {
    if (!value) return [];
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value
        .map((c) => (typeof c === 'string' ? c.trim() : String(c)))
        .filter(Boolean);
    }
    return [];
  }
}
