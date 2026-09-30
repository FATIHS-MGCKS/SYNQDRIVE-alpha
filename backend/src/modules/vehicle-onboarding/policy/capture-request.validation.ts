import {
  OnboardingCaseSourceMode,
  OnboardingCaseStatus,
  ProductSlug,
} from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRODUCT_SLUG_VALUES = new Set<string>(Object.values(ProductSlug));
const CASE_STATUS_VALUES = new Set<string>(Object.values(OnboardingCaseStatus));
const SOURCE_MODE_VALUES = new Set<string>(Object.values(OnboardingCaseSourceMode));

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
    const parsed = Number.parseInt(input.limit, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid limit');
    }
    out.limit = parsed;
  }
  if (input.cursor !== undefined && input.cursor !== '') {
    if (!UUID_RE.test(input.cursor)) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
    }
    out.cursor = input.cursor;
  }
  return out;
}
