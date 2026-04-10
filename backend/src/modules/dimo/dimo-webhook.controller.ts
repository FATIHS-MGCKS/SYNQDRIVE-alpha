import { Controller, Post, Body, Headers, Logger, Get, HttpCode } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import { createHmac } from 'crypto';

const DIMO_WEBHOOK_SECRET = process.env.DIMO_WEBHOOK_SECRET;

@Controller('webhooks/dimo')
export class DimoWebhookController {
  private readonly logger = new Logger(DimoWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dtcService: DtcService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-dimo-signature') signature?: string,
  ) {
    if (DIMO_WEBHOOK_SECRET) {
      if (!signature) {
        this.logger.warn('DIMO webhook rejected: missing x-dimo-signature header');
        return { status: 'rejected', reason: 'missing_signature' };
      }
      // NOTE: Uses JSON.stringify(parsed body) — if DIMO signs over raw bytes,
      // enable raw body middleware and use req.rawBody instead.
      const expected = createHmac('sha256', DIMO_WEBHOOK_SECRET)
        .update(JSON.stringify(body))
        .digest('hex');
      if (signature !== expected && signature !== `sha256=${expected}`) {
        this.logger.warn('DIMO webhook rejected: invalid signature');
        return { status: 'rejected', reason: 'invalid_signature' };
      }
    } else if (!signature) {
      this.logger.debug('DIMO webhook received without signature (DIMO_WEBHOOK_SECRET not configured)');
    }

    this.logger.log(`Received DIMO webhook: type=${body?.type}, tokenId=${body?.tokenId}`);

    const tokenId = body?.tokenId || body?.data?.tokenId;
    if (!tokenId) {
      this.logger.warn('Webhook missing tokenId');
      return { status: 'ignored' };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { dimoVehicle: { tokenId } },
    });

    if (!vehicle) {
      this.logger.warn(`No vehicle found for tokenId=${tokenId}`);
      return { status: 'ignored' };
    }

    const signalName = body?.signal || body?.data?.signal;
    const value = body?.value ?? body?.data?.value;
    const timestamp = body?.timestamp || body?.data?.timestamp;

    if (signalName === 'obdDTCList' && value) {
      await this.handleDtcEvent(vehicle.id, value);
      return { status: 'processed', type: 'dtc' };
    }

    if (signalName === 'speed' && value != null) {
      this.logger.debug(`Speed event for vehicle ${vehicle.id}: ${value} km/h`);
      return { status: 'processed', type: 'speed' };
    }

    if (signalName === 'isIgnitionOn') {
      this.logger.debug(`Ignition event for vehicle ${vehicle.id}: ${value}`);
      return { status: 'processed', type: 'ignition' };
    }

    return { status: 'acknowledged' };
  }

  @Get('health')
  healthCheck() {
    return { status: 'ok', service: 'dimo-webhook' };
  }

  private async handleDtcEvent(vehicleId: string, dtcValue: any) {
    const codes = typeof dtcValue === 'string'
      ? dtcValue.split(',').map((c: string) => c.trim()).filter(Boolean)
      : Array.isArray(dtcValue) ? dtcValue : [];

    this.logger.log(`DTC webhook for vehicle ${vehicleId}: ${codes.length} codes`);

    for (const code of codes) {
      await this.dtcService.upsertDtc(vehicleId, code);
    }

    await this.prisma.vehicleLatestState.updateMany({
      where: { vehicleId },
      data: { obdDtcList: codes, lastDtcPollAt: new Date() },
    });
  }
}
