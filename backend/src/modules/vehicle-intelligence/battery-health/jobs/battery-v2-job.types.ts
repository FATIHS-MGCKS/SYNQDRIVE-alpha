/**
 * Central Battery V2 BullMQ job types and typed payloads (Prompt 21/78).
 *
 * Payloads are ID-only — no PII (names, emails, plates, free-text notes).
 */

export const BATTERY_V2_JOB_TYPES = [
  'BATTERY_OBSERVATION_CLASSIFY',
  'BATTERY_REST_TARGET_EVALUATE',
  'BATTERY_START_PROXY_EXTRACT',
  'BATTERY_ASSESSMENT_RECOMPUTE',
  'BATTERY_PUBLICATION_UPDATE',
  'HV_CAPABILITY_REFRESH',
  'HV_RECHARGE_SESSION_RECONCILE',
  'HV_CAPACITY_SHADOW_RECOMPUTE',
] as const;

export type BatteryV2JobType = (typeof BATTERY_V2_JOB_TYPES)[number];

/** Supported payload contract versions — bump when breaking fields change. */
export const BATTERY_V2_JOB_MODEL_VERSIONS = ['1.0.0'] as const;

export type BatteryV2JobModelVersion = (typeof BATTERY_V2_JOB_MODEL_VERSIONS)[number];

export const BATTERY_V2_JOB_MODEL_VERSION_DEFAULT: BatteryV2JobModelVersion = '1.0.0';

export interface BatteryV2JobAttemptContext {
  attemptNumber: number;
  maxAttempts: number;
  enqueuedAt: string;
  previousFailureCode?: string | null;
}

/** Base fields required on every Battery V2 job payload. */
export interface BatteryV2JobPayloadBase {
  organizationId: string;
  vehicleId: string;
  idempotencyKey: string;
  sourceEntityId?: string | null;
  requestedAt: string;
  modelVersion: BatteryV2JobModelVersion;
  correlationId: string;
  attemptContext: BatteryV2JobAttemptContext;
}

import type { BatteryObservationSnapshotContext } from './battery-v2-snapshot-context.types';

export interface BatteryObservationClassifyPayload extends BatteryV2JobPayloadBase {
  /** Poll-time telemetry needed by the consumer — no PII. */
  snapshotContext?: BatteryObservationSnapshotContext | null;
}

export interface BatteryRestTargetEvaluatePayload extends BatteryV2JobPayloadBase {
  /** Optional rest-window anchor (ISO) — classification input, not PII. */
  restWindowStartedAt?: string | null;
}

export interface BatteryStartProxyExtractPayload extends BatteryV2JobPayloadBase {
  tripId: string;
  tripStartedAt: string;
}

export type BatteryAssessmentRecomputePayload = BatteryV2JobPayloadBase;

export type BatteryPublicationUpdatePayload = BatteryV2JobPayloadBase;

export type HvCapabilityRefreshPayload = BatteryV2JobPayloadBase;

export type HvRechargeSessionReconcilePayload = BatteryV2JobPayloadBase;

export type HvCapacityShadowRecomputePayload = BatteryV2JobPayloadBase;

export type BatteryV2JobPayloadByType = {
  BATTERY_OBSERVATION_CLASSIFY: BatteryObservationClassifyPayload;
  BATTERY_REST_TARGET_EVALUATE: BatteryRestTargetEvaluatePayload;
  BATTERY_START_PROXY_EXTRACT: BatteryStartProxyExtractPayload;
  BATTERY_ASSESSMENT_RECOMPUTE: BatteryAssessmentRecomputePayload;
  BATTERY_PUBLICATION_UPDATE: BatteryPublicationUpdatePayload;
  HV_CAPABILITY_REFRESH: HvCapabilityRefreshPayload;
  HV_RECHARGE_SESSION_RECONCILE: HvRechargeSessionReconcilePayload;
  HV_CAPACITY_SHADOW_RECOMPUTE: HvCapacityShadowRecomputePayload;
};

export type BatteryV2JobPayload<T extends BatteryV2JobType = BatteryV2JobType> =
  BatteryV2JobPayloadByType[T];

export interface BatteryV2JobEnvelope<T extends BatteryV2JobType = BatteryV2JobType> {
  jobType: T;
  payload: BatteryV2JobPayload<T>;
}
