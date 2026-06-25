import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Didit X-Signature-V2 helpers — must match Didit canonicalization exactly. */
export function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        shortenFloats(x),
      ]),
    );
  }
  if (typeof v === 'number' && !Number.isInteger(v) && v % 1 === 0) {
    return Math.trunc(v);
  }
  return v;
}

export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

export function canonicalizeDiditWebhookBody(body: unknown): string {
  return JSON.stringify(sortKeys(shortenFloats(body)));
}

export function hashDiditWebhookPayload(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

const MAX_TIMESTAMP_SKEW_SECONDS = 300;

@Injectable()
export class DiditSignatureService {
  constructor(private readonly configService: ConfigService) {}

  parseJsonBody(rawBody: Buffer): unknown {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid webhook JSON body');
    }
  }

  assertTimestampFresh(
    timestampHeader: string | undefined,
    nowMs: number = Date.now(),
  ): number {
    if (!timestampHeader?.trim()) {
      throw new UnauthorizedException('Missing x-timestamp header');
    }

    const trimmed = timestampHeader.trim();
    let timestampSeconds = Number(trimmed);
    if (!Number.isFinite(timestampSeconds)) {
      const parsed = Date.parse(trimmed);
      if (!Number.isFinite(parsed)) {
        throw new UnauthorizedException('Invalid x-timestamp header');
      }
      timestampSeconds = Math.floor(parsed / 1000);
    }

    const nowSeconds = Math.floor(nowMs / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) {
      throw new UnauthorizedException('Webhook timestamp outside allowed window');
    }

    return timestampSeconds;
  }

  verifySignatureV2(
    body: unknown,
    signatureHeader: string | undefined,
  ): boolean {
    const secret = this.configService.get<string>('didit.webhookSecret', '');
    if (!secret) {
      throw new UnauthorizedException('Didit webhook secret is not configured');
    }
    if (!signatureHeader?.trim()) {
      throw new UnauthorizedException('Missing x-signature-v2 header');
    }

    const canonical = canonicalizeDiditWebhookBody(body);
    const expected = createHmac('sha256', secret)
      .update(canonical, 'utf8')
      .digest('hex');

    return this.timingSafeEqualHex(expected, signatureHeader.trim());
  }

  verifyWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
  ): { body: unknown; payloadHash: string } {
    this.assertTimestampFresh(timestampHeader);
    const body = this.parseJsonBody(rawBody);
    const valid = this.verifySignatureV2(body, signatureHeader);
    if (!valid) {
      throw new UnauthorizedException('Invalid Didit webhook signature');
    }
    return {
      body,
      payloadHash: hashDiditWebhookPayload(rawBody),
    };
  }

  private timingSafeEqualHex(expectedHex: string, provided: string): boolean {
    const normalized = provided.toLowerCase().replace(/^sha256=/, '');
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const providedBuf = Buffer.from(normalized, 'hex');
      if (expectedBuf.length !== providedBuf.length) {
        return false;
      }
      return timingSafeEqual(expectedBuf, providedBuf);
    } catch {
      return false;
    }
  }
}
