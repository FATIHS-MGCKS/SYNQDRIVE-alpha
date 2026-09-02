import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { loadFrozenReferenceManifest } from './reference-capture-manifest.loader';
import type {
  ReferenceCapturePreflightResult,
  ReferenceCaptureReadinessReport,
} from './reference-capture.types';

/** Statuses that block creating another pre-arm session for the same vehicle. */
export const ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES: ReferenceCaptureSessionStatus[] = [
  ReferenceCaptureSessionStatus.CREATED,
  ReferenceCaptureSessionStatus.PREFLIGHT,
  ReferenceCaptureSessionStatus.READY,
  ReferenceCaptureSessionStatus.STARTING,
  ReferenceCaptureSessionStatus.RECORDING,
  ReferenceCaptureSessionStatus.STOPPING,
];

export type PrearmFreshnessAssessment = {
  fresh: boolean;
  blockers: string[];
  preflightAgeMs: number | null;
  preflightMaxAgeMs: number;
};

export function assessPrearmFreshness(args: {
  status: ReferenceCaptureSessionStatus;
  vehicleId: string;
  expectedVehicleId: string;
  readiness: ReferenceCaptureReadinessReport | null;
  preflight: ReferenceCapturePreflightResult | null;
  manifestVersion: string;
  featureEnabled: boolean;
  preflightMaxAgeMs: number;
  nowMs?: number;
}): PrearmFreshnessAssessment {
  const nowMs = args.nowMs ?? Date.now();
  const blockers: string[] = [];

  if (!args.featureEnabled) blockers.push('REFERENCE_CAPTURE_ENABLED=false');
  if (args.vehicleId !== args.expectedVehicleId) blockers.push('vehicle_session_mismatch');
  if (args.status !== ReferenceCaptureSessionStatus.READY) {
    blockers.push(`session_status_not_ready:${args.status}`);
  }
  if (!args.readiness?.deploymentPreflightReady) {
    blockers.push('deployment_preflight_not_ready');
  }
  if (!args.preflight) blockers.push('preflight_missing');

  let preflightAgeMs: number | null = null;
  const assessedAt = args.readiness?.assessedAt;
  if (assessedAt) {
    const assessedMs = Date.parse(assessedAt);
    if (Number.isFinite(assessedMs)) {
      preflightAgeMs = nowMs - assessedMs;
      if (preflightAgeMs > args.preflightMaxAgeMs) {
        blockers.push('prearm_stale_requires_new_prearm');
      }
    } else {
      blockers.push('preflight_assessed_at_invalid');
    }
  } else {
    blockers.push('preflight_assessed_at_missing');
  }

  try {
    const manifest = loadFrozenReferenceManifest();
    if (args.manifestVersion !== manifest.manifestVersion) {
      blockers.push('manifest_version_mismatch');
    }
  } catch {
    blockers.push('manifest_load_failed');
  }

  return {
    fresh: blockers.length === 0,
    blockers,
    preflightAgeMs,
    preflightMaxAgeMs: args.preflightMaxAgeMs,
  };
}

export function describeFastGoStatusRejection(status: ReferenceCaptureSessionStatus): string {
  switch (status) {
    case ReferenceCaptureSessionStatus.CREATED:
    case ReferenceCaptureSessionStatus.PREFLIGHT:
      return 'session_not_prearmed_run_prearm_first';
    case ReferenceCaptureSessionStatus.STARTING:
      return 'session_start_already_in_progress';
    case ReferenceCaptureSessionStatus.STOPPING:
      return 'session_stopping';
    case ReferenceCaptureSessionStatus.COMPLETED:
      return 'session_already_completed';
    case ReferenceCaptureSessionStatus.FAILED:
      return 'session_failed_requires_new_prearm';
    case ReferenceCaptureSessionStatus.ABORTED:
      return 'session_aborted_requires_new_prearm';
    default:
      return `session_status_rejected:${status}`;
  }
}
