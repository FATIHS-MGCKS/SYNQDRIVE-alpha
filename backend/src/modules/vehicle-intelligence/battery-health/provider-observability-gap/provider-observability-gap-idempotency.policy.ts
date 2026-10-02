import {
  PROVIDER_GAP_CONTRACT_VERSION,
  PROVIDER_GAP_OPEN_IDEMPOTENCY_PREFIX,
  PROVIDER_GAP_RESOLUTION_IDEMPOTENCY_PREFIX,
} from './provider-observability-gap.constants';
import type { BatteryProviderObservabilityGapStatus } from '@prisma/client';

export function buildProviderGapOpenIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  contractVersion?: string;
  lastFreshProviderAt: Date;
}): string {
  const contractVersion = input.contractVersion ?? PROVIDER_GAP_CONTRACT_VERSION;
  return [
    PROVIDER_GAP_OPEN_IDEMPOTENCY_PREFIX,
    input.organizationId,
    input.vehicleId,
    contractVersion,
    String(input.lastFreshProviderAt.getTime()),
  ].join(':');
}

export function buildProviderGapResolutionIdempotencyKey(input: {
  gapId: string;
  resolutionStatus: BatteryProviderObservabilityGapStatus;
  firstFreshProviderAt: Date;
}): string {
  return [
    PROVIDER_GAP_RESOLUTION_IDEMPOTENCY_PREFIX,
    input.gapId,
    input.resolutionStatus,
    String(input.firstFreshProviderAt.getTime()),
  ].join(':');
}
