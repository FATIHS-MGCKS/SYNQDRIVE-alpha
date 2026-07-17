import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoiceConversationStatus,
  VoicePstnProvider,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TwilioService } from './twilio.service';
import { TwilioVoiceBridgeService } from './twilio-voice-bridge.service';
import {
  buildTwilioWebhookUrl,
  parseTwilioFormBody,
  validateTwilioWebhookSignature,
} from './twilio-signature.util';
import {
  TwilioInboundCallContext,
  TwilioStatusCallbackContext,
} from './twilio.types';

@Injectable()
export class TwilioWebhookService {
  private readonly logger = new Logger(TwilioWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioService,
    private readonly config: ConfigService,
    private readonly bridge: TwilioVoiceBridgeService,
  ) {}

  async handleInboundVoice(params: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    requestUrl: string;
  }): Promise<string> {
    const form = parseTwilioFormBody(params.body);
    this.assertSignatureValid(params.requestUrl, form, params.headers);

    const context: TwilioInboundCallContext = {
      callSid: form.CallSid ?? '',
      from: form.From ?? '',
      to: form.To ?? '',
      direction: form.Direction ?? 'inbound',
      accountSid: form.AccountSid,
    };

    const assistant = await this.resolveAssistantByToNumber(context.to);
    await this.recordWebhookEvent({
      organizationId: assistant?.organizationId ?? null,
      callSid: context.callSid,
      externalEventId: `${context.callSid}:voice`,
      eventType: 'voice.inbound',
      payload: form,
      headers: params.headers,
      signatureValid: true,
    });

    if (assistant && context.callSid) {
      await this.ensureInboundConversation(assistant, context);
    }

    return this.bridge.buildInboundTwiml(assistant);
  }

  async handleStatusCallback(params: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    requestUrl: string;
  }): Promise<void> {
    const form = parseTwilioFormBody(params.body);
    this.assertSignatureValid(params.requestUrl, form, params.headers);

    const context: TwilioStatusCallbackContext = {
      callSid: form.CallSid ?? '',
      callStatus: form.CallStatus ?? '',
      from: form.From ?? '',
      to: form.To ?? '',
      duration: form.CallDuration,
      direction: form.Direction,
    };

    const assistant =
      (await this.resolveAssistantByCallSid(context.callSid)) ??
      (await this.resolveAssistantByToNumber(context.to));

    await this.recordWebhookEvent({
      organizationId: assistant?.organizationId ?? null,
      callSid: context.callSid,
      externalEventId: `${context.callSid}:status:${context.callStatus}`,
      eventType: `voice.status.${context.callStatus}`,
      payload: form,
      headers: params.headers,
      signatureValid: true,
    });

    if (!assistant || !context.callSid) {
      return;
    }

    await this.applyStatusToConversation(assistant, context);
  }

  private assertSignatureValid(
    requestUrl: string,
    form: Record<string, string>,
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const authToken = this.config.get<string>('twilio.authToken', '');
    if (!authToken.trim()) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Twilio webhook signing is not configured');
      }
      return;
    }

    const signatureHeader = headers['x-twilio-signature'];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    const valid = validateTwilioWebhookSignature({
      authToken,
      signature,
      url: requestUrl,
      body: form,
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid Twilio webhook signature');
    }
  }

  private async resolveAssistantByToNumber(to: string) {
    const normalized = to.trim();
    if (!normalized) return null;

    return this.prisma.voiceAssistant.findFirst({
      where: {
        pstnProvider: VoicePstnProvider.TWILIO,
        OR: [
          { phoneNumber: normalized },
          { phoneNumber: normalized.replace(/\s+/g, '') },
        ],
      },
    });
  }

  private async resolveAssistantByCallSid(callSid: string) {
    if (!callSid) return null;
    const conversation = await this.prisma.voiceConversation.findFirst({
      where: { twilioCallSid: callSid },
      include: { voiceAssistant: true },
    });
    return conversation?.voiceAssistant ?? null;
  }

  private async ensureInboundConversation(
    assistant: { id: string; organizationId: string; elevenLabsAgentId: string | null },
    context: TwilioInboundCallContext,
  ) {
    const existing = await this.prisma.voiceConversation.findFirst({
      where: {
        organizationId: assistant.organizationId,
        twilioCallSid: context.callSid,
      },
    });
    if (existing) return;

    await this.prisma.voiceConversation.create({
      data: {
        organizationId: assistant.organizationId,
        voiceAssistantId: assistant.id,
        twilioCallSid: context.callSid,
        providerConversationId: context.callSid,
        providerAgentId: assistant.elevenLabsAgentId,
        callerNumber: context.from,
        direction: VoiceConversationDirection.INBOUND,
        status: VoiceConversationStatus.ACTIVE,
        outcome: VoiceConversationOutcome.RESOLVED,
        metadata: {
          pstnProvider: 'twilio',
          aiProvider: 'elevenlabs',
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async applyStatusToConversation(
    assistant: { id: string; organizationId: string },
    context: TwilioStatusCallbackContext,
  ) {
    const terminal = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
    const status = context.callStatus.toLowerCase();
    const durationSeconds = context.duration ? parseInt(context.duration, 10) : null;

    const conversation = await this.prisma.voiceConversation.findFirst({
      where: {
        organizationId: assistant.organizationId,
        twilioCallSid: context.callSid,
      },
    });

    if (!conversation) {
      return;
    }

    const data: Prisma.VoiceConversationUpdateInput = {
      metadata: {
        ...(typeof conversation.metadata === 'object' && conversation.metadata
          ? (conversation.metadata as Record<string, unknown>)
          : {}),
        twilioCallStatus: context.callStatus,
      } as Prisma.InputJsonValue,
    };

    if (terminal.has(status)) {
      data.status = VoiceConversationStatus.COMPLETED;
      data.endedAt = new Date();
      if (durationSeconds && Number.isFinite(durationSeconds)) {
        data.durationSeconds = durationSeconds;
      }
      if (status === 'no-answer' || status === 'busy') {
        data.outcome = VoiceConversationOutcome.ABANDONED;
      } else if (status === 'failed' || status === 'canceled') {
        data.outcome = VoiceConversationOutcome.FAILED;
      }
    }

    await this.prisma.voiceConversation.update({
      where: { id: conversation.id },
      data,
    });

    if (terminal.has(status) && durationSeconds && durationSeconds > 0) {
      const answered = status === 'completed';
      await this.prisma.voiceAssistant.update({
        where: { id: assistant.id },
        data: {
          totalCalls: { increment: 1 },
          answeredCalls: answered ? { increment: 1 } : undefined,
          missedCalls: answered ? undefined : { increment: 1 },
          totalTalkTimeSeconds: answered ? { increment: durationSeconds } : undefined,
          totalTalkMinutes: answered
            ? { increment: durationSeconds / 60 }
            : undefined,
        },
      });
    }
  }

  private async recordWebhookEvent(params: {
    organizationId: string | null;
    callSid: string;
    externalEventId: string;
    eventType: string;
    payload: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
    signatureValid: boolean;
  }) {
    try {
      await this.prisma.twilioWebhookEvent.create({
        data: {
          organizationId: params.organizationId,
          callSid: params.callSid || null,
          externalEventId: params.externalEventId,
          eventType: params.eventType,
          payload: params.payload as Prisma.InputJsonValue,
          headers: params.headers as Prisma.InputJsonValue,
          signatureValid: params.signatureValid,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      this.logger.warn(
        `Failed to persist Twilio webhook event ${params.externalEventId}`,
      );
    }
  }

  buildPublicWebhookUrl(path: string): string {
    const base = this.twilio.getVoiceWebhookBaseUrl();
    return buildTwilioWebhookUrl(base, path);
  }
}
