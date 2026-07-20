import { createHash } from 'crypto';
import { HEALTH_FINDING_IDENTITY_VERSION } from './health-finding-identity.config';
import type {
  HealthFindingFingerprintPair,
  HealthFindingIdentity,
  HealthFindingIdentityInput,
  HealthFindingModule,
  HealthFindingSourceEntityType,
} from './health-finding-identity.types';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]{0,127}$/;
const SOURCE_ENTITY_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function sha256(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function normalizePart(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Normalizes finding codes to SCREAMING_SNAKE — rejects display-only labels.
 */
export function normalizeHealthFindingCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('findingCode is required');
  }
  const normalized = trimmed
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();
  if (!CODE_PATTERN.test(normalized)) {
    throw new Error(`findingCode must normalize to SCREAMING_SNAKE: "${raw}"`);
  }
  return normalized;
}

/**
 * Normalizes source entity ids — alphanumeric tokens only, no embedded free text blobs.
 */
export function normalizeHealthFindingSourceEntityId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('sourceEntityId is required');
  }
  if (trimmed.length > 128) {
    throw new Error('sourceEntityId exceeds max length');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('sourceEntityId must not contain whitespace');
  }
  if (!SOURCE_ENTITY_ID_PATTERN.test(trimmed)) {
    throw new Error(`sourceEntityId contains invalid characters: "${raw}"`);
  }
  return trimmed.toLowerCase();
}

function assertIsoTimestamp(label: string, value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }
  return new Date(ms).toISOString();
}

function resolveOccurrenceGeneration(value: number | undefined): number {
  const generation = value ?? 1;
  if (!Number.isInteger(generation) || generation < 1) {
    throw new Error('occurrenceGeneration must be a positive integer');
  }
  return generation;
}

export function assertHealthFindingModule(value: string): asserts value is HealthFindingModule {
  const allowed: HealthFindingModule[] = [
    'battery',
    'tires',
    'brakes',
    'error_codes',
    'service_compliance',
    'complaints',
    'vehicle_alerts',
  ];
  if (!allowed.includes(value as HealthFindingModule)) {
    throw new Error(`Unsupported healthModule: ${value}`);
  }
}

export function assertHealthFindingSourceEntityType(
  value: string,
): asserts value is HealthFindingSourceEntityType {
  const allowed: HealthFindingSourceEntityType[] = [
    'rental_health_module',
    'rental_reason_code',
    'dtc_code',
    'brake_alert',
    'tire_alert',
    'battery_signal',
    'compliance_signal',
    'vehicle_alert',
    'complaint',
    'oem_dashboard_light',
  ];
  if (!allowed.includes(value as HealthFindingSourceEntityType)) {
    throw new Error(`Unsupported sourceEntityType: ${value}`);
  }
}

/**
 * Deterministic logical fingerprint for a health finding.
 * Excludes display text, task types, timestamps, and sensitive raw payloads.
 */
export function buildHealthFindingSourceFindingId(input: {
  organizationId: string;
  vehicleId: string;
  healthModule: HealthFindingModule;
  findingCode: string;
  sourceEntityType: HealthFindingSourceEntityType;
  sourceEntityId: string;
}): string {
  const findingCode = normalizeHealthFindingCode(input.findingCode);
  const sourceEntityId = normalizeHealthFindingSourceEntityId(input.sourceEntityId);

  return sha256([
    HEALTH_FINDING_IDENTITY_VERSION,
    normalizePart(input.organizationId),
    normalizePart(input.vehicleId),
    normalizePart(input.healthModule),
    findingCode,
    normalizePart(input.sourceEntityType),
    sourceEntityId,
  ]);
}

/**
 * Occurrence id distinguishes a new episode after remediation from prior episodes
 * sharing the same logical `sourceFindingId`.
 */
export function buildHealthFindingOccurrenceId(
  sourceFindingId: string,
  occurrenceGeneration: number,
): string {
  const generation = resolveOccurrenceGeneration(occurrenceGeneration);
  return sha256([sourceFindingId, String(generation)]);
}

export function buildHealthFindingFingerprintPair(
  input: HealthFindingIdentityInput,
): HealthFindingFingerprintPair {
  assertHealthFindingModule(input.healthModule);
  assertHealthFindingSourceEntityType(input.sourceEntityType);

  const occurrenceGeneration = resolveOccurrenceGeneration(input.occurrenceGeneration);
  const sourceFindingId = buildHealthFindingSourceFindingId(input);
  const findingOccurrenceId = buildHealthFindingOccurrenceId(sourceFindingId, occurrenceGeneration);

  return {
    sourceFindingId,
    findingOccurrenceId,
    occurrenceGeneration,
    version: HEALTH_FINDING_IDENTITY_VERSION,
  };
}

/**
 * Builds the full stable identity contract from structured inputs.
 */
export function buildHealthFindingIdentity(input: HealthFindingIdentityInput): HealthFindingIdentity {
  const firstObservedAt = assertIsoTimestamp('firstObservedAt', input.firstObservedAt);
  const currentObservedAt = assertIsoTimestamp('currentObservedAt', input.currentObservedAt);
  if (Date.parse(currentObservedAt) < Date.parse(firstObservedAt)) {
    throw new Error('currentObservedAt must not be before firstObservedAt');
  }

  const fingerprint = buildHealthFindingFingerprintPair(input);
  const findingCode = normalizeHealthFindingCode(input.findingCode);
  const sourceEntityId = normalizeHealthFindingSourceEntityId(input.sourceEntityId);

  return {
    organizationId: input.organizationId.trim(),
    vehicleId: input.vehicleId.trim(),
    healthModule: input.healthModule,
    findingCode,
    sourceEntityType: input.sourceEntityType,
    sourceEntityId,
    firstObservedAt,
    currentObservedAt,
    occurrenceGeneration: fingerprint.occurrenceGeneration,
    version: fingerprint.version,
    sourceFindingId: fingerprint.sourceFindingId,
    findingOccurrenceId: fingerprint.findingOccurrenceId,
  };
}

export function healthFindingIdentitiesMatch(
  a: Pick<HealthFindingIdentity, 'sourceFindingId'>,
  b: Pick<HealthFindingIdentity, 'sourceFindingId'>,
): boolean {
  return a.sourceFindingId === b.sourceFindingId;
}

export function isSameHealthFindingOccurrence(
  a: Pick<HealthFindingIdentity, 'findingOccurrenceId'>,
  b: Pick<HealthFindingIdentity, 'findingOccurrenceId'>,
): boolean {
  return a.findingOccurrenceId === b.findingOccurrenceId;
}

/**
 * True when two identities describe the same logical finding in different episodes
 * (e.g. reopened after remediation).
 */
export function isReopenedHealthFindingEpisode(
  prior: Pick<HealthFindingIdentity, 'sourceFindingId' | 'occurrenceGeneration'>,
  next: Pick<HealthFindingIdentity, 'sourceFindingId' | 'occurrenceGeneration'>,
): boolean {
  return (
    prior.sourceFindingId === next.sourceFindingId &&
    next.occurrenceGeneration > prior.occurrenceGeneration
  );
}
