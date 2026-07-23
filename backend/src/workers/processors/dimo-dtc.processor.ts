import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTelemetryService } from '../../modules/dimo/dimo-telemetry.service';
import { DimoAuthService } from '../../modules/dimo/dimo-auth.service';
import { DtcService } from '../../modules/vehicle-intelligence/dtc/dtc.service';
import { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import { normalizeDtcSeverityBand } from '@modules/vehicle-intelligence/dtc/dtc-severity.util';
import type { VehicleHealthAdapterSource } from '@modules/notifications/adapters/notification-adapter.types';
import { TelemetryIngestionEnforcementService } from '@modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.service';
import {
  TELEMETRY_INGEST_DATA_CATEGORY,
  TELEMETRY_INGEST_PATH,
  TELEMETRY_INGEST_PURPOSE,
  TELEMETRY_INGEST_SERVICE_IDENTITY,
  TELEMETRY_INGEST_SOURCE_SYSTEM,
} from '@modules/data-authorizations/telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.constants';
import { QUEUE_NAMES } from '../queues/queue-names';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';

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
    @Optional() private readonly ingestGate?: TelemetryIngestionEnforcementService,
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
    if (!canEnqueueQueue(this.logger, 'dtc-poll-fanout')) return;

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

      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { organizationId: true },
      });
      if (!vehicle?.organizationId) {
        this.logger.warn(`DTC poll skipped — vehicle ${vehicleId} missing organizationId`);
        return;
      }

      if (this.ingestGate) {
        const gate = await this.ingestGate.evaluateIngest({
          organizationId: vehicle.organizationId,
          vehicleId,
          sourceSystem: TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
          dataCategory: TELEMETRY_INGEST_DATA_CATEGORY.DTC_CODES,
          purpose: TELEMETRY_INGEST_PURPOSE.VEHICLE_HEALTH,
          ingestionPath: TELEMETRY_INGEST_PATH.DIMO_DTC_POLL,
          serviceIdentity: TELEMETRY_INGEST_SERVICE_IDENTITY.DIMO_DTC_WORKER,
          correlationId: `ingest:dtc-poll:${vehicleId}:${now.toISOString()}`,
        });
        if (!gate.mayPersist) {
          this.logger.warn(
            `DTC ingest denied vehicleId=${vehicleId} reason=${gate.reasonCode} correlation=${gate.correlationId}`,
          );
          return;
        }
      }

      const producerContext = {
        sourceProvider: 'DIMO' as const,
        sourceTimestamp: dtcSignal?.timestamp ? new Date(dtcSignal.timestamp) : now,
        organizationId: vehicle.organizationId,
      };

      // Upsert codes that are present in the new poll
      for (const code of newCodes) {
        await this.dtcService.upsertDtc(vehicleId, code, { producerContext });
      }

      // Clear codes that were active but are no longer present
      for (const code of previousCodes) {
        if (!newCodeSet.has(code)) {
          await this.dtcService.clearDtc(vehicleId, code, { producerContext });
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

      await this.emitDtcHealthNotifications(vehicleId, previousCodes, newCodeSet);

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

  // ── Helpers ────────────────────────────────────────────────────────

  /** Canonical OBD-II DTC shape: P/B/C/U + 4 alphanumerics (e.g. P0675). */
  private static readonly DTC_PATTERN = /^[PBCU][0-9A-Z]{4}$/;

  /**
   * Turns the raw `obdDTCList` value into a clean, deduped list of canonical DTC
   * codes. DIMO delivers this signal in several shapes and they must all collapse
   * to individual codes:
   *   - JSON-encoded array string: '["P0675"]' or '["P0675","P0420"]'
   *   - comma-joined string:       'P0675, P0420'
   *   - native array:              ['P0675', 'P0420']
   *   - single string:             'P0675'
   * Tokens are sanitized (quotes/brackets/whitespace stripped, upper-cased) and
   * validated against the canonical pattern so malformed blobs like '["P0675"]'
   * are never stored as a code.
   */
  private normalizeDtcCodes(value: unknown): string[] {
    if (value === null || value === undefined) return [];

    // A JSON-array string (e.g. '["P0675"]') must be parsed before tokenizing —
    // otherwise the brackets/quotes get stored as part of the "code".
    let source: unknown = value;
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          source = JSON.parse(trimmed);
        } catch {
          // Not valid JSON — fall through to comma-splitting below.
        }
      }
    }

    const tokens: string[] = Array.isArray(source)
      ? source.map((c) => (typeof c === 'string' ? c : String(c)))
      : typeof source === 'string'
        ? source.split(',')
        : [];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const token of tokens) {
      const code = this.sanitizeDtcCode(token);
      if (code && !seen.has(code)) {
        seen.add(code);
        out.push(code);
      }
    }
    return out;
  }

  /** Strips quotes/brackets/whitespace, upper-cases, and validates the code. */
  private sanitizeDtcCode(raw: string): string | null {
    const cleaned = raw.replace(/["'[\]\s]/g, '').toUpperCase();
    return DimoDtcProcessor.DTC_PATTERN.test(cleaned) ? cleaned : null;
  }
}
