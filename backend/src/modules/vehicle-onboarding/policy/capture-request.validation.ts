import {
  OnboardingCaseSourceMode,
  OnboardingCaseStatus,
  ProductSlug,
} from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { assertExactObjectKeys } from './capture-strict-keys.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRODUCT_SLUG_VALUES = new Set<string>(Object.values(ProductSlug));
const CASE_STATUS_VALUES = new Set<string>(Object.values(OnboardingCaseStatus));
const SOURCE_MODE_VALUES = new Set<string>(Object.values(OnboardingCaseSourceMode));

const LIMIT_QUERY_RE = /^\d+$/;

/** Reject null, arrays, primitives — HTTP bodies must be plain JSON objects. */
export function parseCaptureRequestBody(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Request body must be a JSON object',
    );
  }
  return body as Record<string, unknown>;
}

export function parseListLimitQueryString(limit: string): number {
  if (!LIMIT_QUERY_RE.test(limit)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid limit');
  }
  const parsed = Number(limit);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid limit');
  }
  return parsed;
}

export function parseRequiredConcurrencyToken(
  body: Record<string, unknown>,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(body, 'expectedConcurrencyToken')) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'expectedConcurrencyToken is required',
    );
  }
  const val = body.expectedConcurrencyToken;
  if (val === null) return null;
  if (typeof val !== 'string') {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'expectedConcurrencyToken must be a string or null',
    );
  }
  return val;
}

export function parseSelectedProductRuntime(value: unknown): ProductSlug {
  if (typeof value !== 'string' || !PRODUCT_SLUG_VALUES.has(value)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid selectedProduct');
  }
  return value as ProductSlug;
}

export function parseReadinessEvaluateRequestBody(body: unknown): ProductSlug {
  const record = parseCaptureRequestBody(body);
  assertExactObjectKeys(record, ['selectedProduct'], 'readiness evaluate body');
  return parseSelectedProductRuntime(record.selectedProduct);
}

export function parseReadinessSealRequestBody(body: unknown): {
  selectedProduct: ProductSlug;
  expectedConcurrencyToken: string | null;
} {
  const record = parseCaptureRequestBody(body);
  assertExactObjectKeys(
    record,
    ['selectedProduct', 'expectedConcurrencyToken'],
    'readiness seal body',
  );
  return {
    selectedProduct: parseSelectedProductRuntime(record.selectedProduct),
    expectedConcurrencyToken: parseRequiredConcurrencyToken(record),
  };
}

export interface ValidatedCaseListQuery {
  status?: OnboardingCaseStatus;
  sourceMode?: OnboardingCaseSourceMode;
  limit?: number;
  cursor?: string;
}

export function parseCaseListQuery(input: {
  status?: string;
  sourceMode?: string;
  limit?: string;
  cursor?: string;
}): ValidatedCaseListQuery {
  const out: ValidatedCaseListQuery = {};
  if (input.status !== undefined && input.status !== '') {
    if (!CASE_STATUS_VALUES.has(input.status)) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid status filter');
    }
    out.status = input.status as OnboardingCaseStatus;
  }
  if (input.sourceMode !== undefined && input.sourceMode !== '') {
    if (!SOURCE_MODE_VALUES.has(input.sourceMode)) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid sourceMode filter');
    }
    out.sourceMode = input.sourceMode as OnboardingCaseSourceMode;
  }
  if (input.limit !== undefined && input.limit !== '') {
    out.limit = parseListLimitQueryString(input.limit);
  }
  if (input.cursor !== undefined && input.cursor !== '') {
    if (!UUID_RE.test(input.cursor)) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
    }
    out.cursor = input.cursor;
  }
  return out;
}
