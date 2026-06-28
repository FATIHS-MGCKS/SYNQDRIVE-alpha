import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  RawBodyRequest,
  Headers,
  Logger,
  Get,
  HttpCode,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import {
  buildDimoVerificationResponse,
  inferObdPlugStateFromWebhookContext,
  isBlockedEngineWebhookSignal,
  isDimoVerificationRequest,
  normalizeDimoWebhookPayload,
} from './dimo-webhook-payload.util';
import { createHmac, timingSafeEqual } from 'crypto';
import dimoConfig from '@config/dimo.config';

@Controller('webhooks/dimo')
export class DimoWebhookController {
  private readonly logger = new Logger(DimoWebhookController.name);
  private readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  // Only strict local dev may accept unsigned webhooks. Staging / test / preview
  // environments MUST provide DIMO_WEBHOOK_SECRET — otherwise we fail closed.
  private readonly allowUnsignedInDev = this.nodeEnv === 'development';

  constructor(
    @Inject(dimoConfig.KEY) private readonly dimoConf: ConfigType<typeof dimoConfig>,
    private readonly prisma: PrismaService,
    private readonly dtcService: DtcService,
    private readonly deviceConnection: DeviceConnectionWebhookService,
  ) {
    const secret = process.env.DIMO_WEBHOOK_SECRET;
    if (!this.allowUnsignedInDev && !secret) {
      this.logger.error(
        `DIMO_WEBHOOK_SECRET is not set (NODE_ENV=${this.nodeEnv}). All inbound DIMO webhooks will be rejected until this is fixed.`,
      );
    }
    if (!this.resolveVerificationToken() && !this.allowUnsignedInDev) {
      this.logger.warn(
        'DIMO_WEBHOOK_VERIFICATION_TOKEN is not set — DIMO Developer Console webhook URL verification will return 503.',
      );
    }
  }

  /** Read at request time so PM2 --update-env picks up changes without stale ctor cache. */
  private resolveVerificationToken(): string {
    const fromConfig = this.dimoConf.webhookVerificationToken?.trim() ?? '';
    if (fromConfig) return fromConfig;
    return (process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '').trim();
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
    @Headers('x-dimo-signature') signature: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // ── 1) DIMO Vehicle Triggers URL verification (no HMAC on probe) ─────────
    if (isDimoVerificationRequest(body)) {
      const verificationToken = this.resolveVerificationToken();
      if (!verificationToken) {
        this.logger.error('DIMO webhook verification rejected: DIMO_WEBHOOK_VERIFICATION_TOKEN not configured');
        throw new ServiceUnavailableException({
          status: 'rejected',
          reason: 'verification_not_configured',
        });
      }
      this.logger.log('DIMO webhook URL verification handshake succeeded');
      res.type('text/plain; charset=utf-8');
      return buildDimoVerificationResponse(verificationToken);
    }

    // ── 2) HMAC verification for real trigger payloads ───────────────────────
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

    const payload = normalizeDimoWebhookPayload(body);
    this.logger.log(
      `Received DIMO webhook: type=${payload.cloudEventType ?? body?.type ?? 'legacy'}, tokenId=${payload.tokenId}`,
    );

    if (isBlockedEngineWebhookSignal(payload.signalName)) {
      this.logger.debug(
        `Ignored blocked engine webhook signal for tokenId=${payload.tokenId}: ${payload.signalName}`,
      );
      return { status: 'ignored', reason: 'blocked_engine_signal' };
    }

    const tokenId = payload.tokenId;
    if (tokenId == null) {
      this.logger.warn('Webhook missing resolvable tokenId (tokenId/subject/assetDID)');
      return { status: 'ignored', reason: 'missing_token_id' };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { dimoVehicle: { tokenId } },
    });

    if (!vehicle) {
      this.logger.warn(`No vehicle found for tokenId=${tokenId}`);
      return { status: 'ignored', reason: 'unknown_vehicle' };
    }

    const signalName = payload.signalName;
    const value = payload.value;
    const timestamp = payload.timestamp;

    if (signalName === 'obdDTCList' && value) {
      await this.handleDtcEvent(vehicle.id, value);
      return { status: 'processed', type: 'dtc' };
    }

    // ── OBD device plug/unplug (connectivity / tamper evidence) ───────────────
    if (
      DeviceConnectionWebhookService.isObdPluggedSignal(signalName, payload.metricName) ||
      inferObdPlugStateFromWebhookContext(payload) != null
    ) {
      const pluggedIn =
        DeviceConnectionWebhookService.parsePluggedValue(value) ??
        inferObdPlugStateFromWebhookContext(payload);

      if (pluggedIn == null) {
        this.logger.warn(`OBD plug webhook for vehicle ${vehicle.id} had no parseable plug state`);
        return { status: 'ignored', reason: 'non_boolean_plug_state' };
      }

      const observedAt = timestamp ? new Date(timestamp) : new Date();
      const { outcome, eventId, eventType } = await this.deviceConnection.ingestObdPlugStateChange({
        vehicle: { id: vehicle.id, organizationId: vehicle.organizationId },
        tokenId,
        pluggedIn,
        observedAt: Number.isNaN(observedAt.getTime()) ? new Date() : observedAt,
        rawPayload: body,
      });
      return { status: 'processed', type: 'device_connection', outcome, eventId, eventType };
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
    return {
      status: 'ok',
      service: 'dimo-webhook',
      verificationConfigured: Boolean(this.resolveVerificationToken()),
      hmacConfigured: Boolean(process.env.DIMO_WEBHOOK_SECRET?.trim()),
    };
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
