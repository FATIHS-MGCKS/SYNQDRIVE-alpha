import { HttpException } from '@nestjs/common';
import { CommunicationReplySendState } from '@prisma/client';
import { WHATSAPP_ERROR_CODES } from '@modules/whatsapp/utils/whatsapp-errors';
import { CommunicationReplyError } from './communication-reply.errors';

/** Provider-neutral outbound outcome classification for reply commands. */
export enum CommunicationReplyOutcomeClass {
  DEFINITIVE_REJECTED = 'DEFINITIVE_REJECTED',
  UNKNOWN = 'UNKNOWN',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  TEMPLATE_REQUIRED = 'TEMPLATE_REQUIRED',
}

const DEFINITIVE_NATIVE_FAILURE_PREFIXES = [
  'WHATSAPP_PROVIDER_NOT_CONFIGURED',
  'WHATSAPP_FREE_TEXT_BLOCKED',
  'WHATSAPP_CONSENT_OPTED_OUT',
  'WHATSAPP_POLICY_BLOCKED',
  'WHATSAPP_TEMPLATE_NOT_APPROVED',
  'WHATSAPP_SIMULATION_DISABLED',
] as const;

const TRANSPORT_UNCERTAINTY_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /econnrefused/i,
  /socket hang up/i,
  /network/i,
  /aborted/i,
  /fetch failed/i,
  /gateway timeout/i,
] as const;

export function classifyReplyError(error: unknown): CommunicationReplyOutcomeClass {
  const response = (error as { response?: { code?: string; message?: string } })?.response;
  const code = response?.code ?? '';
  const message = String(response?.message ?? (error instanceof Error ? error.message : ''));

  switch (code) {
    case 'CHANNEL_NOT_CONFIGURED':
    case WHATSAPP_ERROR_CODES.PROVIDER_NOT_CONFIGURED:
      return CommunicationReplyOutcomeClass.NOT_CONFIGURED;
    case 'TEMPLATE_REQUIRED':
    case WHATSAPP_ERROR_CODES.FREE_TEXT_BLOCKED:
      return CommunicationReplyOutcomeClass.TEMPLATE_REQUIRED;
    case 'RATE_LIMITED':
      return CommunicationReplyOutcomeClass.RATE_LIMITED;
    case 'SEND_UNKNOWN':
    case 'WHATSAPP_SEND_AMBIGUOUS':
      return CommunicationReplyOutcomeClass.UNKNOWN;
    case WHATSAPP_ERROR_CODES.CONSENT_OPTED_OUT:
    case WHATSAPP_ERROR_CODES.POLICY_BLOCKED:
    case WHATSAPP_ERROR_CODES.TEMPLATE_NOT_APPROVED:
    case WHATSAPP_ERROR_CODES.SIMULATION_DISABLED:
    case 'SEND_FAILED':
    case 'MESSAGE_TOO_LONG':
    case 'MESSAGE_EMPTY':
      return CommunicationReplyOutcomeClass.DEFINITIVE_REJECTED;
    default:
      if (message.toLowerCase().includes('rate')) {
        return CommunicationReplyOutcomeClass.RATE_LIMITED;
      }
      if (TRANSPORT_UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(message))) {
        return CommunicationReplyOutcomeClass.UNKNOWN;
      }
      if (error instanceof HttpException && error.getStatus() >= 500) {
        return CommunicationReplyOutcomeClass.UNKNOWN;
      }
      return CommunicationReplyOutcomeClass.DEFINITIVE_REJECTED;
  }
}

export function classifyNativeWhatsAppFailureReason(
  failureReason: string | null | undefined,
): CommunicationReplyOutcomeClass {
  const reason = String(failureReason ?? '').toUpperCase();
  if (!reason) return CommunicationReplyOutcomeClass.DEFINITIVE_REJECTED;
  if (reason.includes('NOT_CONFIGURED')) return CommunicationReplyOutcomeClass.NOT_CONFIGURED;
  if (reason.includes('FREE_TEXT') || reason.includes('TEMPLATE')) {
    return CommunicationReplyOutcomeClass.TEMPLATE_REQUIRED;
  }
  if (DEFINITIVE_NATIVE_FAILURE_PREFIXES.some((prefix) => reason.includes(prefix))) {
    return CommunicationReplyOutcomeClass.DEFINITIVE_REJECTED;
  }
  if (TRANSPORT_UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(reason))) {
    return CommunicationReplyOutcomeClass.UNKNOWN;
  }
  return CommunicationReplyOutcomeClass.DEFINITIVE_REJECTED;
}

export function mapOutcomeClassToCommandState(
  outcome: CommunicationReplyOutcomeClass,
): CommunicationReplySendState {
  switch (outcome) {
    case CommunicationReplyOutcomeClass.UNKNOWN:
      return CommunicationReplySendState.UNKNOWN;
    default:
      return CommunicationReplySendState.FAILED;
  }
}

export function throwReplyErrorForOutcome(
  outcome: CommunicationReplyOutcomeClass,
  failureCode?: string | null,
): never {
  switch (outcome) {
    case CommunicationReplyOutcomeClass.NOT_CONFIGURED:
      throw CommunicationReplyError.channelNotConfigured();
    case CommunicationReplyOutcomeClass.TEMPLATE_REQUIRED:
      throw CommunicationReplyError.templateRequired();
    case CommunicationReplyOutcomeClass.RATE_LIMITED:
      throw CommunicationReplyError.rateLimited();
    case CommunicationReplyOutcomeClass.UNKNOWN:
      throw CommunicationReplyError.sendUnknown();
    default:
      throw CommunicationReplyError.sendFailed();
  }
}

export function throwReplyErrorForFailureCode(failureCode: string | null | undefined): never {
  const code = String(failureCode ?? 'SEND_FAILED').toUpperCase();
  if (code.includes('NOT_CONFIGURED') || code === 'CHANNEL_NOT_CONFIGURED') {
    throw CommunicationReplyError.channelNotConfigured();
  }
  if (code.includes('TEMPLATE')) {
    throw CommunicationReplyError.templateRequired();
  }
  if (code === 'RATE_LIMITED') {
    throw CommunicationReplyError.rateLimited();
  }
  if (code === 'SEND_UNKNOWN') {
    throw CommunicationReplyError.sendUnknown();
  }
  throw CommunicationReplyError.sendFailed();
}

export function mapProviderHttpFailureReason(
  httpStatus: number,
  failureReason?: string | null,
): CommunicationReplyOutcomeClass {
  const reason = String(failureReason ?? '');
  if (TRANSPORT_UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(reason))) {
    return CommunicationReplyOutcomeClass.UNKNOWN;
  }
  if (httpStatus === 429) return CommunicationReplyOutcomeClass.RATE_LIMITED;
  if (httpStatus >= 500) return CommunicationReplyOutcomeClass.UNKNOWN;
  return CommunicationReplyOutcomeClass.DEFINITIVE_REJECTED;
}
