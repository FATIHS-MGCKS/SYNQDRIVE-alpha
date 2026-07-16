/**
 * Central Battery V2 job identity and idempotency key builders (Prompt 23/78).
 *
 * Job identities are deterministic and align with Prisma unique constraints.
 */

import {
  buildBatteryProviderObservationIdempotencyKey,
  canonicalizeBatteryProviderObservationValue,
  type BatteryProviderObservationValue,
} from '../battery-provider-observation.policy';
import { BATTERY_V2_JOB_MODEL_VERSION_DEFAULT } from './battery-v2-job.types';

export const BATTERY_V2_JOB_IDENTITY_PREFIX = {
  observation: 'battery-obs',
  hvSnapshot: 'hv-snap',
  restTarget: 'rest-target',
  batteryRest: 'battery-rest',
  startProxy: 'start-proxy',
  assessment: 'assess',
  publication: 'pub',
  hvSession: 'hv-session',
  hvCapacity: 'hv-cap',
  capability: 'cap-refresh',
} as const;

export type BatteryRestTargetType = 'REST_60M' | 'REST_6H' | 'REST_TARGET';

/** Observation: vehicle + signal + provider + observedAt + value */
export function buildObservationJobIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  signalName: string;
  providerSource: string;
  observedAt: Date;
  normalizedValue: BatteryProviderObservationValue;
}): string {
  return buildBatteryProviderObservationIdempotencyKey(input);
}

/** Rest: vehicle + rest window + target type (legacy reconciliation key). */
export function buildRestTargetJobIdempotencyKey(input: {
  vehicleId: string;
  restWindowStartedAt: Date;
  restTargetType: BatteryRestTargetType;
}): string {
  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.restTarget,
    input.vehicleId,
    input.restTargetType,
    String(input.restWindowStartedAt.getTime()),
  ].join(':');
}

/** LV rest window target job: battery-rest:{vehicleId}:{restWindowId}:60m|6h */
export function buildBatteryRestTargetJobIdempotencyKey(input: {
  vehicleId: string;
  restWindowId: string;
  targetSuffix: '60m' | '6h';
}): string {
  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.batteryRest,
    input.vehicleId,
    input.restWindowId,
    input.targetSuffix,
  ].join(':');
}

export function targetSuffixForRestType(
  restTargetType: Extract<BatteryRestTargetType, 'REST_60M' | 'REST_6H'>,
): '60m' | '6h' {
  return restTargetType === 'REST_60M' ? '60m' : '6h';
}

/** Start proxy: trip ID + model version */
export function buildStartProxyJobIdempotencyKey(input: {
  tripId: string;
  modelVersion?: string;
}): string {
  const version = input.modelVersion ?? BATTERY_V2_JOB_MODEL_VERSION_DEFAULT;
  return `${BATTERY_V2_JOB_IDENTITY_PREFIX.startProxy}:${version}:trip:${input.tripId}`;
}

/** Assessment: vehicle + assessment type + input version */
export function buildAssessmentJobIdempotencyKey(input: {
  vehicleId: string;
  assessmentType: string;
  inputVersion: string | number;
}): string {
  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.assessment,
    input.vehicleId,
    input.assessmentType,
    String(input.inputVersion),
  ].join(':');
}

/** Publication: assessment ID + publication version */
export function buildPublicationJobIdempotencyKey(input: {
  assessmentId: string;
  publicationVersion: string | number;
}): string {
  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.publication,
    input.assessmentId,
    `v${input.publicationVersion}`,
  ].join(':');
}

/** HV session: provider segment fingerprint (scoped per vehicle) */
export function buildRechargeSegmentFingerprint(dimoSegmentId: string): string {
  return `dimo-seg:${dimoSegmentId}`;
}

export function buildHvSessionJobIdempotencyKey(input: {
  vehicleId: string;
  segmentFingerprint: string;
}): string {
  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.hvSession,
    input.vehicleId,
    input.segmentFingerprint,
  ].join(':');
}

/** HV capacity shadow: session ID + method + model version */
export function buildHvCapacityJobIdempotencyKey(input: {
  chargeSessionId: string;
  method: string;
  modelVersion: string | number;
}): string {
  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.hvCapacity,
    input.chargeSessionId,
    input.method,
    `m${input.modelVersion}`,
  ].join(':');
}

/** Capability refresh: vehicle + provider + signal scope + trigger bucket */
export function buildCapabilityRefreshJobIdempotencyKey(input: {
  vehicleId: string;
  providerSource: string;
  signalScope: string;
  trigger: string;
  periodBucket?: string;
  nonce?: string;
}): string {
  const parts = [
    BATTERY_V2_JOB_IDENTITY_PREFIX.capability,
    input.vehicleId,
    input.providerSource,
    input.signalScope,
    input.trigger,
  ];

  if (input.trigger === 'PERIODIC') {
    parts.push(input.periodBucket ?? '0');
  } else {
    parts.push(input.nonce ?? '0');
  }

  return parts.join(':');
}

export function buildCapabilityRefreshPeriodBucket(
  at: Date,
  intervalMs: number,
): string {
  return String(Math.floor(at.getTime() / intervalMs));
}

export function canonicalizeObservationValue(
  value: BatteryProviderObservationValue,
): string {
  return canonicalizeBatteryProviderObservationValue(value);
}
