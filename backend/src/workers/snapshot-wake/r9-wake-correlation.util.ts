import { createHash } from 'crypto';

import {
  WAKE_CORRELATION_ID_HEX_LENGTH,
  WAKE_CORRELATION_ID_VERSION,
} from './r9-wake-correlation.constants';
import type {
  BuildR9WakeCorrelationInput,
  R9DegradedIdentityStrategy,
  R9ProviderWakeCorrelationContext,
} from './r9-provider-wake-correlation.types';
import type { SnapshotJobOrigin } from './snapshot-wake.types';

function normalizeIsoTimestamp(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }
  return value.toISOString();
}

function normalizeSignalName(signalName: string): string {
  const trimmed = signalName.trim();
  if (!trimmed) return '';
  return trimmed.includes('.') ? trimmed.split('.').pop()! : trimmed;
}

function normalizeWakeReason(reason: string): string {
  return reason.trim();
}

/**
 * Stable fingerprint for idempotency when provider delivery id is absent.
 * Must not include raw webhook JSON — only normalized trigger identity fields.
 */
export function buildR9WakePayloadFingerprint(params: {
  dimoTokenId: number;
  signalName: string;
  wakeReason: string;
  providerObservedAt: Date | null;
  value: unknown;
}): string {
  const valueToken =
    params.value === null || params.value === undefined
      ? ''
      : typeof params.value === 'object'
        ? JSON.stringify(params.value)
        : String(params.value);
  const material = [
    String(params.dimoTokenId),
    normalizeSignalName(params.signalName),
    normalizeWakeReason(params.wakeReason),
    normalizeIsoTimestamp(params.providerObservedAt),
    valueToken,
  ].join('|');
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 32);
}

export function extractProviderDeliveryId(body: unknown): string | null {
  const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!root) return null;
  const candidates = [
    root.id,
    root.eventId,
    root.event_id,
    (root.data as Record<string, unknown> | undefined)?.eventId,
    (root.data as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.trim();
    }
  }
  return null;
}

export function resolveR9DegradedIdentityStrategy(params: {
  providerDeliveryId: string | null;
  providerObservedAt: Date | null;
  payloadFingerprint: string | null;
}): R9DegradedIdentityStrategy {
  if (params.providerDeliveryId) {
    return 'PROVIDER_DELIVERY_ID';
  }
  if (params.providerObservedAt) {
    return 'PROVIDER_OBSERVED_AT';
  }
  if (params.payloadFingerprint) {
    return 'PAYLOAD_FINGERPRINT';
  }
  return 'DEGRADED_NO_PROVIDER_OBSERVED_AT';
}

/**
 * Deterministic wakeCorrelationId — forensic only; does not affect snapshot-{vehicleId}.
 */
export function computeWakeCorrelationId(params: {
  organizationId: string;
  vehicleId: string;
  dimoTokenId: number;
  signalName: string;
  wakeReason: string;
  providerObservedAt: Date | null;
  providerDeliveryId: string | null;
  payloadFingerprint: string | null;
}): string {
  const providerDeliveryId = params.providerDeliveryId?.trim() ?? '';
  if (providerDeliveryId) {
    const material = [
      WAKE_CORRELATION_ID_VERSION,
      params.organizationId,
      params.vehicleId,
      String(params.dimoTokenId),
      normalizeSignalName(params.signalName),
      normalizeWakeReason(params.wakeReason),
      `delivery:${providerDeliveryId}`,
    ].join('\0');
    return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, WAKE_CORRELATION_ID_HEX_LENGTH);
  }

  const observedIso = normalizeIsoTimestamp(params.providerObservedAt);
  const fingerprint = params.payloadFingerprint?.trim() ?? '';
  const material = [
    WAKE_CORRELATION_ID_VERSION,
    params.organizationId,
    params.vehicleId,
    String(params.dimoTokenId),
    normalizeSignalName(params.signalName),
    normalizeWakeReason(params.wakeReason),
    observedIso ? `observed:${observedIso}` : 'observed:__MISSING__',
    fingerprint ? `fp:${fingerprint}` : 'fp:__MISSING__',
  ].join('\0');
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, WAKE_CORRELATION_ID_HEX_LENGTH);
}

export function buildR9ProviderWakeCorrelationContext(
  input: BuildR9WakeCorrelationInput,
): R9ProviderWakeCorrelationContext {
  const providerObservedAt =
    input.providerObservedAt && Number.isFinite(input.providerObservedAt.getTime())
      ? input.providerObservedAt.toISOString()
      : null;
  const receivedAt = input.receivedAt.toISOString();
  const providerDeliveryId = input.providerDeliveryId?.trim() || null;
  const payloadFingerprint = input.payloadFingerprint?.trim() || null;
  const wakeCorrelationId = computeWakeCorrelationId({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    dimoTokenId: input.dimoTokenId,
    signalName: input.signalName,
    wakeReason: input.wakeReason,
    providerObservedAt: input.providerObservedAt,
    providerDeliveryId,
    payloadFingerprint,
  });

  return {
    wakeCorrelationId,
    wakeCorrelationVersion: WAKE_CORRELATION_ID_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    dimoTokenId: input.dimoTokenId,
    signalName: input.signalName,
    wakeReason: input.wakeReason,
    providerObservedAt,
    receivedAt,
    providerDeliveryId,
    payloadFingerprint,
    probeGeneration: input.probeGeneration ?? 0,
    wakeVersion: 1,
    origin: input.origin ?? 'PROVIDER_WAKE',
  };
}

export function assertDistinctWakeTimestamps(params: {
  providerObservedAt: Date | null;
  receivedAt: Date;
  providerFetchedAt?: Date | null;
  snapshotSourceTimestamp?: Date | null;
}): void {
  if (params.providerObservedAt && params.receivedAt.getTime() === params.providerObservedAt.getTime()) {
    // Allowed only when both are genuinely equal — callers must not synthesize providerObservedAt from receivedAt.
    return;
  }
  if (
    params.providerFetchedAt &&
    params.snapshotSourceTimestamp &&
    params.providerFetchedAt.getTime() === params.snapshotSourceTimestamp.getTime()
  ) {
    // Equal timestamps can occur but must not be assumed by default in persistence layer.
    return;
  }
}

/** Bridge for future R9O-3 without duplicating fields on SnapshotWakeContext yet. */
export function correlationFromSnapshotWakeFields(
  input: BuildR9WakeCorrelationInput,
): R9ProviderWakeCorrelationContext {
  return buildR9ProviderWakeCorrelationContext(input);
}
