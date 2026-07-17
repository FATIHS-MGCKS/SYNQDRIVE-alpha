import { createHmac, timingSafeEqual } from 'crypto';
import { VOICE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS } from './voice-webhook-ingestion.constants';

export function validateElevenLabsWebhookSignature(params: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const { rawBody, signatureHeader, secret } = params;
  if (!secret.trim() || !signatureHeader?.trim()) {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((segment) => {
      const [key, value] = segment.trim().split('=');
      return [key, value];
    }),
  );

  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) {
    return false;
  }

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) {
    return false;
  }
  if (Math.abs(now - ts) > VOICE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
