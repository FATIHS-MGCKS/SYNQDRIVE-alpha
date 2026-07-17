import { createHash } from 'node:crypto';
import type { VoicePhoneRegulatoryStatus } from '@prisma/client';
import type { TwilioRegulatoryItemStatus } from './twilio-provisioning.types';

export function maskTwilioSid(value: string | null | undefined, prefix = 'ref'): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return `${prefix}_***`;
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

export function maskE164(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 6) {
    return '***';
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-2)}`;
}

export function digestCanonicalValue(value: string): string {
  return createHash('sha256').update(value.trim()).digest('hex');
}

export function mapRegulatoryItemStatus(value: string | null | undefined): TwilioRegulatoryItemStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'in_review':
    case 'in-review':
      return 'in_review';
    case 'pending':
      return 'pending';
    default:
      return 'pending';
  }
}

export function mapOverallRegulatoryStatus(
  bundle: TwilioRegulatoryItemStatus,
  address: TwilioRegulatoryItemStatus,
  endUser: TwilioRegulatoryItemStatus,
): VoicePhoneRegulatoryStatus {
  const values = [bundle, address, endUser];
  if (values.some((value) => value === 'rejected')) {
    return 'REJECTED';
  }
  if (values.every((value) => value === 'approved')) {
    return 'APPROVED';
  }
  if (values.some((value) => value === 'in_review')) {
    return 'IN_REVIEW';
  }
  if (values.some((value) => value === 'pending')) {
    return 'PENDING';
  }
  return 'UNKNOWN';
}

export function sanitizeTwilioProvisioningLogMessage(message: string): string {
  return message
    .replace(/\bAC[A-Za-z0-9]{20,}\b/g, 'AC[REDACTED]')
    .replace(/\bSK[A-Za-z0-9]{20,}\b/g, 'SK[REDACTED]')
    .replace(/\+[0-9]{6,}/g, '+[REDACTED]')
    .replace(/apiKeySecret=\S+/gi, 'apiKeySecret=[REDACTED]')
    .replace(/token=\S+/gi, 'token=[REDACTED]');
}
