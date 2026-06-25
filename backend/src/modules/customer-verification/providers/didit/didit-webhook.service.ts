import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerVerificationService } from '../../customer-verification.service';
import { parseDiditDecision } from './didit-decision.parser';
import { DiditSignatureService } from './didit-signature.service';
import { mapDiditStatusToCheckStatus } from './didit-status.mapper';
import {
  buildDiditDedupeEventId,
  DiditWebhookPayloadV3,
  SUPPORTED_DIDIT_WEBHOOK_TYPES,
} from './didit-webhook.types';

@Injectable()
export class DiditWebhookService {
  private readonly logger = new Logger(DiditWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureService: DiditSignatureService,
    private readonly verificationService: CustomerVerificationService,
  ) {}

  async receiveWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: true; duplicate?: boolean }> {
    const signature = this.headerValue(headers, 'x-signature-v2');
    const timestamp = this.headerValue(headers, 'x-timestamp');

    const { body, payloadHash } = this.signatureService.verifyWebhook(
      rawBody,
      signature,
      timestamp,
    );

    const payload = body as DiditWebhookPayloadV3;
    const dedupeEventId = buildDiditDedupeEventId(payload);

    if (dedupeEventId) {
      const existingByEvent = await this.prisma.diditWebhookEvent.findUnique({
        where: { eventId: dedupeEventId },
      });
      if (existingByEvent) {
        return { received: true, duplicate: true };
      }
    }

    const existingByHash = await this.prisma.diditWebhookEvent.findUnique({
      where: { payloadHash },
    });
    if (existingByHash) {
      return { received: true, duplicate: true };
    }

    let webhookEventId: string;
    try {
      const created = await this.prisma.diditWebhookEvent.create({
        data: {
          eventId: dedupeEventId,
          sessionId: payload.session_id ?? null,
          eventType: payload.webhook_type ?? null,
          providerStatus: payload.status ?? null,
          payloadHash,
          signatureValid: true,
          rawPayload: body as Prisma.InputJsonValue,
        },
      });
      webhookEventId = created.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    setImmediate(() => {
      this.processWebhookEvent(webhookEventId, payload).catch((error) => {
        this.logger.error(
          `Didit webhook async processing failed for ${webhookEventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });

    return { received: true };
  }

  private async processWebhookEvent(
    webhookEventId: string,
    payload: DiditWebhookPayloadV3,
  ): Promise<void> {
    const webhookType = payload.webhook_type?.trim();
    if (!webhookType || !SUPPORTED_DIDIT_WEBHOOK_TYPES.has(webhookType)) {
      this.logger.debug(
        `Ignoring unsupported Didit webhook_type=${webhookType ?? 'missing'}`,
      );
      await this.markProcessed(webhookEventId);
      return;
    }

    const sessionId = payload.session_id?.trim();
    if (!sessionId) {
      this.logger.warn('Didit webhook missing session_id');
      await this.markProcessed(webhookEventId);
      return;
    }

    const check = await this.prisma.customerVerificationCheck.findFirst({
      where: {
        provider: 'DIDIT',
        providerSessionId: sessionId,
      },
    });

    if (!check) {
      this.logger.warn(
        `Didit webhook for unknown session_id=${sessionId} — no CustomerVerificationCheck found`,
      );
      await this.markProcessed(webhookEventId);
      return;
    }

    const mapped = mapDiditStatusToCheckStatus(payload.status);
    const decisionResult = parseDiditDecision(payload.decision, check.kind);

    const warnings: Array<Record<string, unknown>> = [
      ...decisionResult.warnings,
    ];
    if (mapped.warning) {
      warnings.push({ source: 'didit_status_mapper', message: mapped.warning });
    }
    if (mapped.status === 'KYC_EXPIRED') {
      warnings.push({
        source: 'didit_verification_expired',
        message: 'Erneute Dokumentenprüfung erforderlich — Verifikation abgelaufen.',
      });
    }
    if (payload.status === 'Resubmitted' && payload.resubmit_info !== undefined) {
      warnings.push({
        source: 'didit_resubmit',
        message: 'Didit hat eine erneute Einreichung angefordert.',
        detail: payload.resubmit_info,
      });
    }

    await this.verificationService.applyDiditDecision({
      sessionId,
      normalizedDecision: {
        status: mapped.status,
        providerStatus: payload.status ?? null,
        workflowId: payload.workflow_id ?? null,
        vendorData: payload.vendor_data ?? check.vendorData,
        decisionJson:
          (decisionResult.decisionJson as Prisma.InputJsonValue) ?? null,
        extractedJson:
          (decisionResult.extractedJson as Prisma.InputJsonValue) ?? null,
        warnings:
          warnings.length > 0
            ? (warnings as Prisma.InputJsonValue)
            : null,
      },
    });

    await this.markProcessed(webhookEventId);
  }

  private async markProcessed(webhookEventId: string): Promise<void> {
    await this.prisma.diditWebhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: new Date() },
    });
  }

  private headerValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const direct = headers[name];
    if (typeof direct === 'string') return direct;
    if (Array.isArray(direct)) return direct[0];

    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== lower) continue;
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value[0];
    }
    return undefined;
  }
}
