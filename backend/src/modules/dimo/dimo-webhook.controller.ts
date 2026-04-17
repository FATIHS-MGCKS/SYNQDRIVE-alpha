import { Controller, Post, Body, Req, RawBodyRequest, Headers, Logger, Get, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import { createHmac, timingSafeEqual } from 'crypto';

@Controller('webhooks/dimo')
export class DimoWebhookController {
  private readonly logger = new Logger(DimoWebhookController.name);
  private readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  private readonly isProduction = this.nodeEnv === 'production';
  // Only strict local dev may accept unsigned webhooks. Staging / test / preview
  // environments MUST provide DIMO_WEBHOOK_SECRET — otherwise we fail closed.
  private readonly allowUnsignedInDev = this.nodeEnv === 'development';

  constructor(
    private readonly prisma: PrismaService,
    private readonly dtcService: DtcService,
  ) {
    const secret = process.env.DIMO_WEBHOOK_SECRET;
    if (!this.allowUnsignedInDev && !secret) {
      this.logger.error(
        `DIMO_WEBHOOK_SECRET is not set (NODE_ENV=${this.nodeEnv}). All inbound DIMO webhooks will be rejected until this is fixed.`,
      );
    }
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
    @Headers('x-dimo-signature') signature?: string,
  ) {
    const secret = process.env.DIMO_WEBHOOK_SECRET;

    if (!secret) {
      if (!this.allowUnsignedInDev) {
        this.logger.warn(
          `DIMO webhook rejected: DIMO_WEBHOOK_SECRET not configured (NODE_ENV=${this.nodeEnv})`,
        );
        return { status: 'rejected', reason: 'webhook_not_configured' };
      }
      this.logger.debug(
        'DIMO webhook received without signature check (NODE_ENV=development, secret absent)',
      );
    } else {
      if (!signature) {
        this.logger.warn('DIMO webhook rejected: missing x-dimo-signature header');
        return { status: 'rejected', reason: 'missing_signature' };
      }
      // Prefer raw body for accurate HMAC; fall back to serialised parsed body.
      const toSign: Buffer | string = req.rawBody ?? JSON.stringify(body);
      const expected = createHmac('sha256', secret).update(toSign).digest('hex');
      const expectedPrefixed = `sha256=${expected}`;

      const sigBuf = Buffer.from(signature);
      const rawMatch = sigBuf.length === expected.length && timingSafeEqual(sigBuf, Buffer.from(expected));
      const prefixedMatch = sigBuf.length === expectedPrefixed.length && timingSafeEqual(sigBuf, Buffer.from(expectedPrefixed));

      if (!rawMatch && !prefixedMatch) {
        this.logger.warn('DIMO webhook rejected: invalid signature');
        return { status: 'rejected', reason: 'invalid_signature' };
      }
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
