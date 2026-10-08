import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export function toVehicleOnboardingHttpException(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }
  if (!(error instanceof VehicleOnboardingError)) {
    return error as HttpException;
  }
  const body = {
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
  switch (error.code) {
    case 'CASE_NOT_FOUND':
      return new NotFoundException(body);
    case 'ONBOARDING_CONCURRENCY_CONFLICT':
    case 'TERMINAL_CASE_IDEMPOTENCY':
    case 'SOURCE_ALREADY_CLAIMED':
    case 'SOURCE_ALREADY_REGISTERED':
    case 'SOURCE_CLAIM_INTEGRITY_CONFLICT':
    case 'IDENTITY_REVIEW_REQUIRED':
    case 'SOURCE_SET_REQUIRES_REVIEW':
    case 'PRIMARY_SOURCE_CONFLICT':
    case 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST':
    case 'SOURCE_REF_CONFLICT':
    case 'OFFBOARD_OPERATIONALLY_BLOCKED':
      return new ConflictException(body);
    case 'ORGANIZATION_MISMATCH':
      return new ForbiddenException(body);
    case 'UNSUPPORTED_CONTRACT_VERSION':
    case 'INVALID_CAPTURE_PAYLOAD':
    case 'SCHEMA_REQUIRED_FIELDS_MISSING':
    case 'STATION_SCOPE_MISMATCH':
    case 'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH':
      return new UnprocessableEntityException(body);
    default:
      return new UnprocessableEntityException(body);
  }
}

export async function runVehicleOnboardingHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toVehicleOnboardingHttpException(error);
  }
}
