import type { ReferenceCaptureConfig } from './reference-capture.config';
import type { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';
import {
  EXP021_CADENCE_PHASE_ORDER_MS,
  EXP021_MANDATORY_SETTLEMENT_OBSERVATIONS,
  EXP021_WHOLE_TRIP_SHADOW_OBSERVATIONS,
} from './reference-capture-settlement-shadow.policy';
import type { SettlementShadowPreflightResult } from './reference-capture-settlement-shadow.types';

export async function runExp021SettlementShadowPreflight(args: {
  config: ReferenceCaptureConfig;
  repository: ReferenceCaptureSettlementShadowRepository;
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  dimoReachable: boolean;
  persistenceWritable: boolean;
  activeCalibrationSessionId: string | null;
  staleShadowJobs: number;
}): Promise<SettlementShadowPreflightResult> {
  const checks = [
    {
      code: 'REFERENCE_CAPTURE_ENABLED',
      ok: args.config.isEnabled(),
      detail: args.config.isEnabled() ? 'enabled' : 'REFERENCE_CAPTURE_ENABLED=false',
    },
    {
      code: 'SETTLEMENT_SHADOW_ENABLED',
      ok: args.config.isSettlementShadowEnabled(),
      detail: args.config.isSettlementShadowEnabled()
        ? 'enabled'
        : 'REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=false',
    },
    {
      code: 'VEHICLE_TOKEN_CONFIGURED',
      ok: Number.isFinite(args.tokenId) && args.tokenId > 0,
      detail: `vehicleId=${args.vehicleId} tokenId=${args.tokenId}`,
    },
    {
      code: 'NO_STALE_CALIBRATION_SESSION',
      ok: !args.activeCalibrationSessionId,
      detail: args.activeCalibrationSessionId
        ? `active session ${args.activeCalibrationSessionId}`
        : 'no active RC session',
    },
    {
      code: 'NO_STALE_SHADOW_JOBS',
      ok: args.staleShadowJobs === 0,
      detail: `staleShadowJobs=${args.staleShadowJobs}`,
    },
    {
      code: 'PERSISTENCE_WRITABLE',
      ok: args.persistenceWritable,
      detail: args.persistenceWritable ? 'ok' : 'persistence check failed',
    },
    {
      code: 'DIMO_REACHABLE',
      ok: args.dimoReachable,
      detail: args.dimoReachable ? 'ok' : 'DIMO query probe failed',
    },
    {
      code: 'NEXT_SEQUENCE',
      ok: true,
      detail: EXP021_CADENCE_PHASE_ORDER_MS.map((ms) => ms / 1000).join('→'),
    },
    {
      code: 'VIDEO_GT_REQUIRED',
      ok: true,
      detail: 'Timestamped video CEST UTC+2 required for physical drive',
    },
  ];

  const ready = checks.every((c) => c.ok);

  return {
    ready,
    checks,
    expectedSettlementShadowRequests: EXP021_MANDATORY_SETTLEMENT_OBSERVATIONS,
    expectedPostTripShadowRequests: EXP021_WHOLE_TRIP_SHADOW_OBSERVATIONS,
    expectedTotalShadowRequests:
      EXP021_MANDATORY_SETTLEMENT_OBSERVATIONS + EXP021_WHOLE_TRIP_SHADOW_OBSERVATIONS,
    nextSequence: EXP021_CADENCE_PHASE_ORDER_MS.map((ms) => ms / 1000).join('_'),
  };
}
