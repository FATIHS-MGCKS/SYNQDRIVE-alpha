import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import documentExtractionConfig from '@config/document-extraction.config';
import { RedisService } from '@shared/redis/redis.service';
import { DocumentExtractionObservabilityService } from './document-extraction-observability.service';
import { DocumentUploadRateLimitedException } from './document-upload-rate-limit.errors';
import type {
  AssertDocumentUploadRateLimitInput,
  DocumentUploadRateLimitDecision,
  DocumentUploadRateLimitScope,
} from './document-upload-rate-limit.types';

const CONSUME_LIMIT_SCRIPT = `
local count_limit = tonumber(ARGV[1])
local byte_limit = tonumber(ARGV[2])
local byte_incr = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])

local current_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local current_bytes = tonumber(redis.call('GET', KEYS[2]) or '0')

if current_count + 1 > count_limit then
  return {0, 'count'}
end
if current_bytes + byte_incr > byte_limit then
  return {0, 'bytes'}
end

local new_count = redis.call('INCR', KEYS[1])
if new_count == 1 then
  redis.call('PEXPIRE', KEYS[1], ttl_ms)
end

local new_bytes = redis.call('INCRBY', KEYS[2], byte_incr)
if new_bytes == byte_incr then
  redis.call('PEXPIRE', KEYS[2], ttl_ms)
end

return {1, 'ok'}
`;

type ScopeLimits = {
  scope: DocumentUploadRateLimitScope;
  keyId: string;
  maxUploads: number;
  maxBytes: number;
};

@Injectable()
export class DocumentUploadRateLimitService {
  private readonly logger = new Logger(DocumentUploadRateLimitService.name);

  constructor(
    @Inject(documentExtractionConfig.KEY)
    private readonly docConfig: ConfigType<typeof documentExtractionConfig>,
    private readonly redis: RedisService,
    private readonly observability: DocumentExtractionObservabilityService,
  ) {}

  async assertAllowed(input: AssertDocumentUploadRateLimitInput): Promise<void> {
    if (!this.docConfig.uploadRateLimitEnabled) return;

    const decision = await this.evaluate(input);
    if (decision.allowed) return;

    this.observability.recordUploadRateLimited(decision.scope, decision.reason);
    throw new DocumentUploadRateLimitedException(decision);
  }

  async evaluate(input: AssertDocumentUploadRateLimitInput): Promise<DocumentUploadRateLimitDecision> {
    if (!this.docConfig.uploadRateLimitEnabled) {
      return { allowed: true, windowMs: this.docConfig.uploadRateLimitWindowMs, limitMultiplier: 1 };
    }

    const multiplier = this.resolveLimitMultiplier(input);
    const windowMs = this.docConfig.uploadRateLimitWindowMs;
    const bucket = Math.floor(Date.now() / windowMs);
    const ttlMs = windowMs + 5_000;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (Date.now() % windowMs)) / 1000),
    );

    const scopes: ScopeLimits[] = [
      {
        scope: 'organization',
        keyId: input.organizationId,
        maxUploads: Math.ceil(this.docConfig.uploadRateLimitMaxUploadsPerOrg * multiplier),
        maxBytes: Math.ceil(this.docConfig.uploadRateLimitMaxBytesPerOrg * multiplier),
      },
    ];

    if (input.userId) {
      scopes.push({
        scope: 'user',
        keyId: input.userId,
        maxUploads: Math.ceil(this.docConfig.uploadRateLimitMaxUploadsPerUser * multiplier),
        maxBytes: Math.ceil(this.docConfig.uploadRateLimitMaxBytesPerUser * multiplier),
      });
    }

    const clientIp = normalizeClientIp(input.clientIp);
    if (clientIp) {
      scopes.push({
        scope: 'ip',
        keyId: clientIp,
        maxUploads: Math.ceil(this.docConfig.uploadRateLimitMaxUploadsPerIp * multiplier),
        maxBytes: Math.ceil(this.docConfig.uploadRateLimitMaxBytesPerIp * multiplier),
      });
    }

    for (const scopeLimits of scopes) {
      const violation = await this.consumeScope({
        ...scopeLimits,
        bucket,
        ttlMs,
        sizeBytes: input.sizeBytes,
        retryAfterSeconds,
        windowMs,
      });
      if (violation) return violation;
    }

    return { allowed: true, windowMs, limitMultiplier: multiplier };
  }

  private async consumeScope(input: {
    scope: DocumentUploadRateLimitScope;
    keyId: string;
    bucket: number;
    maxUploads: number;
    maxBytes: number;
    sizeBytes: number;
    ttlMs: number;
    retryAfterSeconds: number;
    windowMs: number;
  }): Promise<Extract<DocumentUploadRateLimitDecision, { allowed: false }> | null> {
    const countKey = `synqdrive:doc-upload:${input.scope}:${input.keyId}:${input.bucket}:count`;
    const bytesKey = `synqdrive:doc-upload:${input.scope}:${input.keyId}:${input.bucket}:bytes`;

    try {
      const raw = (await this.redis.eval(
        CONSUME_LIMIT_SCRIPT,
        2,
        countKey,
        bytesKey,
        String(input.maxUploads),
        String(input.maxBytes),
        String(input.sizeBytes),
        String(input.ttlMs),
      )) as [number, string];

      if (raw?.[0] === 1) return null;

      return {
        allowed: false,
        scope: input.scope,
        reason: raw?.[1] === 'bytes' ? 'bytes' : 'count',
        retryAfterSeconds: input.retryAfterSeconds,
        windowMs: input.windowMs,
        limit: raw?.[1] === 'bytes' ? input.maxBytes : input.maxUploads,
      };
    } catch (error) {
      this.logger.warn(
        `Upload rate-limit check failed for scope=${input.scope} — allowing upload (fail-open): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private resolveLimitMultiplier(input: AssertDocumentUploadRateLimitInput): number {
    if (input.platformRole === 'MASTER_ADMIN') {
      return this.docConfig.uploadRateLimitAdminMultiplier;
    }
    if (input.uploadSource === 'operator_app') {
      return this.docConfig.uploadRateLimitOperatorMultiplier;
    }
    return 1;
  }
}

export function normalizeClientIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

export function resolveRequestClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string | null };
}): string | null {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return normalizeClientIp(forwarded);
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return normalizeClientIp(forwarded[0]);
  }
  return normalizeClientIp(req.ip ?? req.connection?.remoteAddress ?? null);
}
