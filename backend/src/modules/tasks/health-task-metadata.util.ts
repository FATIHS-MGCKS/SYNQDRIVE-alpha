import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { HEALTH_FINDING_IDENTITY_VERSION } from '@modules/rental-health/health-finding-identity.config';
import type { HealthFindingSourceEntityType } from '@modules/rental-health/health-finding-identity.types';

export const HEALTH_TASK_METADATA_SOURCE_TYPE = 'HEALTH' as const;

const SOURCE_FINDING_ID_PATTERN = /^[a-f0-9]{64}$/;
const FINDING_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]{0,127}$/;
const SOURCE_ENTITY_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

/** Keys that must never be copied into persisted health-task metadata. */
export const HEALTH_TASK_FORBIDDEN_METADATA_KEYS = [
  'rentalModule',
  'source_findings',
  'tire_read_model',
  'brake_read_model',
  'modules',
  'activeFaultPreview',
  'healthPayload',
  'vehicleHealth',
  'rentalHealth',
  'dtcCodes',
  'dtcPreview',
  'summary',
  'evaluation',
] as const;

export type HealthTaskMetadata = {
  sourceType: typeof HEALTH_TASK_METADATA_SOURCE_TYPE;
  organizationId: string;
  vehicleId: string;
  healthModule: string;
  sourceFindingId?: string;
  findingCode?: string;
  sourceEntityType?: HealthFindingSourceEntityType;
  sourceEntityId?: string;
  findingVersion?: string;
  blockingReasonCode?: string;
  healthState?: string;
  healthReason?: string;
  origin?: string;
  notificationId?: string;
  notificationEventType?: string;
  complianceKind?: string;
};

export type HealthTaskMetadataValidationContext = {
  organizationId: string;
  vehicleId?: string | null;
  sourceType?: string | null;
};

function readMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function isHealthTask(input: HealthTaskMetadataValidationContext, metadata: Record<string, unknown>): boolean {
  if (input.sourceType === 'HEALTH') return true;
  return metadata.sourceType === HEALTH_TASK_METADATA_SOURCE_TYPE;
}

function assertPattern(label: string, value: string, pattern: RegExp): void {
  if (!pattern.test(value)) {
    throw new BadRequestException(`Invalid health task metadata: ${label}`);
  }
}

function stripForbiddenKeys(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if ((HEALTH_TASK_FORBIDDEN_METADATA_KEYS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Validates and normalizes health-task metadata before persistence.
 * Legacy tasks without `sourceFindingId` remain readable — only forbidden payload keys are stripped.
 */
export function sanitizeHealthTaskMetadata(
  metadata: unknown,
  ctx: HealthTaskMetadataValidationContext,
): Prisma.InputJsonValue | undefined {
  const raw = readMetadataRecord(metadata);
  if (!raw) return undefined;

  if (Array.isArray(raw.dtcCodes) || Array.isArray(raw.dtcPreview)) {
    throw new BadRequestException(
      'Health task metadata must not persist raw DTC code lists — use sourceFindingId',
    );
  }

  const stripped = stripForbiddenKeys(raw);
  if (!isHealthTask(ctx, stripped)) {
    return stripped as Prisma.InputJsonValue;
  }

  const organizationId = normalizeOptionalString(stripped.organizationId) ?? ctx.organizationId;
  if (organizationId !== ctx.organizationId) {
    throw new BadRequestException('Health task organizationId does not match request scope');
  }

  const vehicleId = normalizeOptionalString(stripped.vehicleId);
  if (vehicleId && ctx.vehicleId && vehicleId !== ctx.vehicleId) {
    throw new BadRequestException('Health task vehicleId does not match linked vehicle');
  }
  if (!vehicleId && ctx.vehicleId) {
    stripped.vehicleId = ctx.vehicleId;
  }

  const healthModule = normalizeOptionalString(stripped.healthModule);
  if (!healthModule) {
    throw new BadRequestException('Health task metadata requires healthModule');
  }

  const sourceFindingId = normalizeOptionalString(stripped.sourceFindingId);
  const findingCode = normalizeOptionalString(stripped.findingCode);
  const sourceEntityType = normalizeOptionalString(stripped.sourceEntityType);
  const sourceEntityId = normalizeOptionalString(stripped.sourceEntityId);
  const findingVersion = normalizeOptionalString(stripped.findingVersion);
  const blockingReasonCode = normalizeOptionalString(stripped.blockingReasonCode);

  if (sourceFindingId) {
    assertPattern('sourceFindingId', sourceFindingId, SOURCE_FINDING_ID_PATTERN);
    if (!findingCode) {
      throw new BadRequestException('Health task metadata with sourceFindingId requires findingCode');
    }
    if (!sourceEntityType) {
      throw new BadRequestException(
        'Health task metadata with sourceFindingId requires sourceEntityType',
      );
    }
    if (!sourceEntityId) {
      throw new BadRequestException(
        'Health task metadata with sourceFindingId requires sourceEntityId',
      );
    }
    assertPattern('findingCode', findingCode, FINDING_CODE_PATTERN);
    assertPattern('sourceEntityId', sourceEntityId, SOURCE_ENTITY_ID_PATTERN);

    if (sourceFindingId === sourceEntityId.toLowerCase()) {
      throw new BadRequestException(
        'sourceFindingId must not equal sourceEntityId — DTC codes are not global IDs',
      );
    }

    if (findingVersion && findingVersion !== HEALTH_FINDING_IDENTITY_VERSION) {
      throw new BadRequestException('Unsupported health findingVersion');
    }
  } else if (findingCode && sourceEntityType === 'dtc_code') {
    throw new BadRequestException('DTC findings require sourceFindingId — code alone is not a global id');
  }

  const normalized: HealthTaskMetadata = {
    sourceType: HEALTH_TASK_METADATA_SOURCE_TYPE,
    organizationId,
    vehicleId: vehicleId ?? ctx.vehicleId ?? '',
    healthModule,
    ...(sourceFindingId ? { sourceFindingId } : {}),
    ...(findingCode ? { findingCode } : {}),
    ...(sourceEntityType ? { sourceEntityType: sourceEntityType as HealthFindingSourceEntityType } : {}),
    ...(sourceEntityId ? { sourceEntityId: sourceEntityId.toLowerCase() } : {}),
    ...(findingVersion ? { findingVersion } : sourceFindingId ? { findingVersion: HEALTH_FINDING_IDENTITY_VERSION } : {}),
    ...(blockingReasonCode ? { blockingReasonCode } : {}),
    ...(normalizeOptionalString(stripped.healthState) ? { healthState: normalizeOptionalString(stripped.healthState) } : {}),
    ...(normalizeOptionalString(stripped.healthReason) ? { healthReason: normalizeOptionalString(stripped.healthReason) } : {}),
    ...(normalizeOptionalString(stripped.origin) ? { origin: normalizeOptionalString(stripped.origin) } : {}),
    ...(normalizeOptionalString(stripped.notificationId) ? { notificationId: normalizeOptionalString(stripped.notificationId) } : {}),
    ...(normalizeOptionalString(stripped.notificationEventType)
      ? { notificationEventType: normalizeOptionalString(stripped.notificationEventType) }
      : {}),
    ...(normalizeOptionalString(stripped.complianceKind)
      ? { complianceKind: normalizeOptionalString(stripped.complianceKind) }
      : {}),
  };

  if (!normalized.vehicleId) {
    throw new BadRequestException('Health task metadata requires vehicleId');
  }

  return normalized as Prisma.InputJsonValue;
}

export function readHealthTaskSourceFindingId(metadata: unknown): string | null {
  const raw = readMetadataRecord(metadata);
  const id = normalizeOptionalString(raw?.sourceFindingId);
  return id && SOURCE_FINDING_ID_PATTERN.test(id) ? id : null;
}

export function healthTaskDedupKeyFromMetadata(metadata: unknown): string | undefined {
  const sourceFindingId = readHealthTaskSourceFindingId(metadata);
  return sourceFindingId ? `health:finding:${sourceFindingId}` : undefined;
}

export function readLegacyHealthTaskMetadata(metadata: unknown): {
  healthModule: string | null;
  healthState: string | null;
  healthReason: string | null;
} {
  const raw = readMetadataRecord(metadata);
  return {
    healthModule: normalizeOptionalString(raw?.healthModule) ?? null,
    healthState: normalizeOptionalString(raw?.healthState) ?? null,
    healthReason: normalizeOptionalString(raw?.healthReason) ?? null,
  };
}
