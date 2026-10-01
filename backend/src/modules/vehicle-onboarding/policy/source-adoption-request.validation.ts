import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { assertExactObjectKeys } from './capture-strict-keys.util';
import { parseCaptureRequestBody, parseRequiredConcurrencyToken } from './capture-request.validation';
import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROVIDERS = new Set<SourceClaimProvider>(['DIMO', 'HIGH_MOBILITY']);

export function parseSourceAdoptionProvider(value: unknown): SourceClaimProvider {
  if (typeof value !== 'string' || !PROVIDERS.has(value as SourceClaimProvider)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid provider');
  }
  return value as SourceClaimProvider;
}

export function parseSourceMirrorId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid sourceMirrorId');
  }
  return value;
}

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'idempotencyKey is required');
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 128) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid idempotencyKey');
  }
  return trimmed;
}

export function parseSourceAdoptRequestBody(body: unknown): {
  provider: SourceClaimProvider;
  sourceMirrorId: string;
  idempotencyKey: string;
} {
  const record = parseCaptureRequestBody(body);
  assertExactObjectKeys(record, ['provider', 'sourceMirrorId', 'idempotencyKey'], 'source adopt body');
  for (const forbidden of [
    'sourceAdoptionMode',
    'snapshot',
    'externalVehicleIdentity',
    'connectionScope',
    'organizationId',
  ]) {
    if (Object.prototype.hasOwnProperty.call(record, forbidden)) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', `Unknown field: ${forbidden}`);
    }
  }
  return {
    provider: parseSourceAdoptionProvider(record.provider),
    sourceMirrorId: parseSourceMirrorId(record.sourceMirrorId),
    idempotencyKey: parseIdempotencyKey(record.idempotencyKey),
  };
}

export function parseSourceAttachRequestBody(body: unknown): {
  provider: SourceClaimProvider;
  sourceMirrorId: string;
  expectedConcurrencyToken: string | null;
} {
  const record = parseCaptureRequestBody(body);
  assertExactObjectKeys(
    record,
    ['provider', 'sourceMirrorId', 'expectedConcurrencyToken'],
    'source attach body',
  );
  return {
    provider: parseSourceAdoptionProvider(record.provider),
    sourceMirrorId: parseSourceMirrorId(record.sourceMirrorId),
    expectedConcurrencyToken: parseRequiredConcurrencyToken(record),
  };
}
