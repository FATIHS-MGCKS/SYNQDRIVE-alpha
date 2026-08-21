import { createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_VERSION_PREFIX = 'v1,';
const MAX_WEBHOOK_AGE_SECONDS = 300;

export function verifySentDmWebhookSignature(input: {
  rawBody: Buffer;
  webhookId: string;
  timestamp: string;
  signatureHeader: string;
  signingSecret: string;
}): boolean {
  const { rawBody, webhookId, timestamp, signatureHeader, signingSecret } = input;
  if (!webhookId || !timestamp || !signatureHeader || !signingSecret) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS) {
    return false;
  }

  const expected = computeSentDmWebhookSignature({
    rawBody,
    webhookId,
    timestamp,
    signingSecret,
  });
  if (!expected) {
    return false;
  }

  const providedTokens = signatureHeader
    .split(' ')
    .flatMap((part) => part.split(','))
    .map((token) => token.trim())
    .filter((token) => token.startsWith('v1'));

  for (const token of providedTokens.length > 0 ? providedTokens : [signatureHeader.trim()]) {
    const normalized = token.startsWith('v1,') ? token : `${SIGNATURE_VERSION_PREFIX}${token.replace(/^v1/, '')}`;
    if (safeEqual(normalized, expected)) {
      return true;
    }
  }

  return safeEqual(signatureHeader.trim(), expected);
}

export function computeSentDmWebhookSignature(input: {
  rawBody: Buffer;
  webhookId: string;
  timestamp: string;
  signingSecret: string;
}): string | null {
  const keyBytes = decodeSigningSecret(input.signingSecret);
  if (!keyBytes) {
    return null;
  }
  const signedContent = `${input.webhookId}.${input.timestamp}.${input.rawBody.toString('utf8')}`;
  const digest = createHmac('sha256', keyBytes).update(signedContent, 'utf8').digest('base64');
  return `${SIGNATURE_VERSION_PREFIX}${digest}`;
}

function decodeSigningSecret(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed) {
    return null;
  }
  const raw = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
