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
  isDimoTriggerPayload,
  isDimoVerificationRequest,
  isRpmWebhookSignal,
  normalizeDimoWebhookPayload,
  parseRpmWebhookValue,
} from './dimo-webhook-payload.util';
import { createHmac, timingSafeEqual } from 'crypto';
import dimoConfig from '@config/dimo.config';
import { RpmWebhookCandidateService } from './rpm-webhook-candidate.service';
import {
  classifyDimoWebhookRoute,
  formatDimoWebhookLogLine,
  type DimoWebhookLogContext,
} from './dimo-webhook-log.util';

@Controller('webhooks/dimo')
export class DimoWebhookController {
  private readonly logger = new Logger(DimoWebhookController.name);
  private readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  // Only strict local dev may accept unsigned webhooks without verification token.
  private readonly allowUnsignedInDev = this.nodeEnv === 'development';

  constructor(
    @Inject(dimoConfig.KEY) private readonly dimoConf: ConfigType<typeof dimoConfig>,
    private readonly prisma: PrismaService,
    private readonly dtcService: DtcService,
    private readonly deviceConnection: DeviceConnectionWebhookService,
    private readonly rpmWebhookCandidate: RpmWebhookCandidateService,
  ) {
    if (!this.resolveVerificationToken() && !this.allowUnsignedInDev) {
      this.logger.error(
        `DIMO_WEBHOOK_VERIFICATION_TOKEN is not set (NODE_ENV=${this.nodeEnv}). DIMO Vehicle Triggers cannot be verified and trigger payloads will be rejected until this is fixed.`,
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

    // ── 2) Auth for real trigger payloads ────────────────────────────────────
    // DIMO Vehicle Triggers API authenticates via verificationToken at registration.
    // Trigger POSTs do not include x-dimo-signature today — optional HMAC when present.
    const verificationToken = this.resolveVerificationToken();
    if (!verificationToken && !this.allowUnsignedInDev) {
      this.logger.warn(
        `DIMO webhook rejected: DIMO_WEBHOOK_VERIFICATION_TOKEN not configured (NODE_ENV=${this.nodeEnv})`,
      );
      return { status: 'rejected', reason: 'verification_not_configured' };
    }

    if (!isDimoTriggerPayload(body)) {
      this.logger.warn('DIMO webhook rejected: payload does not match Vehicle Triggers shape');
      return { status: 'rejected', reason: 'invalid_payload' };
    }

    const secret = process.env.DIMO_WEBHOOK_SECRET?.trim();
    if (secret && signature) {
      const toSign: Buffer | string = req.rawBody ?? JSON.stringify(body);
      const expected = createHmac('sha256', secret).update(toSign).digest('hex');
      const expectedPrefixed = `sha256=${expected}`;

      const sigBuf = Buffer.from(signature);
      const rawMatch = sigBuf.length === expected.length && timingSafeEqual(sigBuf, Buffer.from(expected));
      const prefixedMatch =
        sigBuf.length === expectedPrefixed.length && timingSafeEqual(sigBuf, Buffer.from(expectedPrefixed));

      if (!rawMatch && !prefixedMatch) {
        this.logger.warn('DIMO webhook rejected: invalid signature');
        return { status: 'rejected', reason: 'invalid_signature' };
      }
    } else if (secret && !signature) {
      this.logger.debug(
        'DIMO webhook accepted without x-dimo-signature (Vehicle Triggers API does not sign trigger POSTs)',
      );
    } else if (!secret && !this.allowUnsignedInDev) {
      this.logger.debug(
        'DIMO webhook accepted without HMAC (verification token configured; DIMO_WEBHOOK_SECRET optional)',
      );
    }

    const payload = normalizeDimoWebhookPayload(body);
    const route = classifyDimoWebhookRoute(payload);

    const logAndReturn = <T extends Record<string, unknown>>(result: T): T => {
      const status = (result.status as DimoWebhookLogContext['status']) ?? 'processed';
      if (route !== 'acknowledged' || status !== 'processed') {
        this.logger.log(
          formatDimoWebhookLogLine({
            tokenId: payload.tokenId,
            vehicleId: typeof result.vehicleId === 'string' ? result.vehicleId : undefined,
            metricName: payload.metricName,
            signalName: payload.signalName,
            webhookName: payload.webhookName,
            value: payload.value,
            route,
            status,
            outcome: typeof result.outcome === 'string' ? result.outcome : undefined,
            reason: typeof result.reason === 'string' ? result.reason : undefined,
          }),
        );
      }
      return result;
    };

    if (isBlockedEngineWebhookSignal(payload.signalName)) {
      return logAndReturn({ status: 'ignored', reason: 'blocked_engine_signal' });
    }

    const tokenId = payload.tokenId;
    if (tokenId == null) {
      return logAndReturn({ status: 'ignored', reason: 'missing_token_id' });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { dimoVehicle: { tokenId } },
      select: {
        id: true,
        organizationId: true,
        hardwareType: true,
        fuelType: true,
      },
    });

    if (!vehicle) {
      return logAndReturn({ status: 'ignored', reason: 'unknown_vehicle' });
    }

    const vehicleId = vehicle.id;
    const signalName = payload.signalName;
    const value = payload.value;
    const timestamp = payload.timestamp;

    if (signalName === 'obdDTCList' && value) {
      await this.handleDtcEvent(vehicleId, value);
      return logAndReturn({ status: 'processed', type: 'dtc', vehicleId });
    }

    if (isRpmWebhookSignal(signalName, payload.metricName)) {
      const rpm = parseRpmWebhookValue(value);
      if (rpm == null) {
        return logAndReturn({
          status: 'ignored',
          type: 'rpm_candidate',
          vehicleId,
          reason: 'non_numeric_rpm',
        });
      }

      const observedAt = timestamp ? new Date(timestamp) : new Date();
      const { outcome, candidateId, status } = await this.rpmWebhookCandidate.ingestRpmThresholdEvent({
        vehicle,
        tokenId,
        observedAt: Number.isNaN(observedAt.getTime()) ? new Date() : observedAt,
        observedValue: rpm,
        rawPayload: body,
      });

      return logAndReturn({
        status: outcome === 'ignored' || outcome === 'skipped_powertrain' ? 'ignored' : 'processed',
        type: 'rpm_candidate',
        vehicleId,
        outcome,
        candidateId,
        candidateStatus: status,
        reason:
          outcome === 'skipped_powertrain'
            ? 'not_applicable_powertrain'
            : outcome === 'ignored'
              ? 'below_threshold_or_intake_error'
              : undefined,
      });
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
        return logAndReturn({
          status: 'ignored',
          type: 'device_connection',
          vehicleId,
          reason: 'non_boolean_plug_state',
        });
      }

      if (pluggedIn && !this.dimoConf.obdPlugInWebhookEnabled) {
        return logAndReturn({
          status: 'ignored',
          type: 'device_connection',
          vehicleId,
          outcome: 'ignored',
          reason: 'plug_in_webhook_disabled',
        });
      }

      const observedAt = timestamp ? new Date(timestamp) : new Date();
      const { outcome, eventId, eventType } = await this.deviceConnection.ingestObdPlugStateChange({
        vehicle: { id: vehicleId, organizationId: vehicle.organizationId },
        tokenId,
        pluggedIn,
        observedAt: Number.isNaN(observedAt.getTime()) ? new Date() : observedAt,
        rawPayload: body,
      });
      return logAndReturn({
        status: outcome === 'ignored' || outcome === 'duplicate' ? 'ignored' : 'processed',
        type: 'device_connection',
        vehicleId,
        outcome,
        eventId,
        eventType,
      });
    }

    if (signalName === 'speed' && value != null) {
      return logAndReturn({ status: 'processed', type: 'speed', vehicleId });
    }

    if (signalName === 'isIgnitionOn') {
      return logAndReturn({ status: 'processed', type: 'ignition', vehicleId });
    }

    return logAndReturn({ status: 'acknowledged', vehicleId });
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'dimo-webhook',
      verificationConfigured: Boolean(this.resolveVerificationToken()),
      hmacConfigured: Boolean(process.env.DIMO_WEBHOOK_SECRET?.trim()),
      authMode: 'verification_token_with_optional_hmac',
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
