import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTelemetryService } from '../../modules/dimo/dimo-telemetry.service';
import { DimoAuthService } from '../../modules/dimo/dimo-auth.service';
import { DtcService } from '../../modules/vehicle-intelligence/dtc/dtc.service';
import { QUEUE_NAMES } from '../queues/queue-names';

@Processor(QUEUE_NAMES.DTC_POLL)
@Injectable()
export class DimoDtcProcessor extends WorkerHost {
  private readonly logger = new Logger(DimoDtcProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: DimoTelemetryService,
    private readonly auth: DimoAuthService,
    private readonly dtcService: DtcService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.log('Starting DTC poll cycle');

    const vehicles = await this.prisma.vehicle.findMany({
      where: { dimoVehicle: { isNot: null } },
      include: { dimoVehicle: true },
    });

    for (const vehicle of vehicles) {
      const tokenId = vehicle.dimoVehicle?.tokenId;
      if (!tokenId) continue;
      await this.pollVehicleDtc(vehicle.id, tokenId);
    }

    this.logger.log(`DTC poll cycle finished for ${vehicles.length} vehicles`);
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

      // Use the filtered signalsLatest form so we only pull obdDTCList
      const query = `
        query {
          signalsLatest(tokenId: ${tokenId}, signals: [obdDTCList]) {
            timestamp
            signal
            value
          }
        }
      `;
      const result = await this.telemetry.queryGraphQL(jwt, query);

      const signalRows: any[] = result?.data?.signalsLatest ?? [];
      const dtcSignal = signalRows.find((s: any) => s.signal === 'obdDTCList');

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
        .catch(() => {
          // Best-effort update — ignore secondary failures
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
