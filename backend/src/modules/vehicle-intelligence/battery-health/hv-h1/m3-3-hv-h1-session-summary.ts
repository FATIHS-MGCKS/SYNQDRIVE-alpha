import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import type { HvChargeSessionQualityStatus } from '../hv-charge-session/hv-charge-session-quality.status';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from '../hv-charge-session/hv-charge-session.types';

export interface M3_3HvH1SessionRowForSummary {
  source: string;
  isOngoing: boolean;
  metadata: unknown;
}

export interface M3_3HvH1SessionSummaryCounts {
  totalSessions: number;
  nativeDimoSessionCount: number;
  fallbackSessionCount: number;
  ongoingSessionCount: number;
  strongSessionCount: number;
  weakSessionCount: number;
  capacityValidationEligibleCount: number;
}

function readQualityStatus(session: M3_3HvH1SessionRowForSummary): HvChargeSessionQualityStatus | null {
  const meta = session.metadata as { qualityStatus?: HvChargeSessionQualityStatus } | null;
  return meta?.qualityStatus ?? null;
}

function readCapacityValidationEligible(session: M3_3HvH1SessionRowForSummary): boolean {
  const meta = session.metadata as { capacityValidationEligible?: boolean } | null;
  return meta?.capacityValidationEligible === true;
}

/** Strong = qualified session quality authority, not merely native DIMO source. */
export function isStrongHvChargeSessionForH1(session: M3_3HvH1SessionRowForSummary): boolean {
  if (session.isOngoing) return false;
  const status = readQualityStatus(session);
  return status === HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED;
}

export function isWeakHvChargeSessionForH1(session: M3_3HvH1SessionRowForSummary): boolean {
  if (session.isOngoing) return true;
  const status = readQualityStatus(session);
  if (status == null) return true;
  return status !== HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED;
}

export function summarizeHvChargeSessionsForH1(
  sessions: M3_3HvH1SessionRowForSummary[],
): M3_3HvH1SessionSummaryCounts {
  let nativeDimoSessionCount = 0;
  let fallbackSessionCount = 0;
  let ongoingSessionCount = 0;
  let strongSessionCount = 0;
  let weakSessionCount = 0;
  let capacityValidationEligibleCount = 0;

  for (const session of sessions) {
    if (session.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
      nativeDimoSessionCount += 1;
    } else if (session.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
      fallbackSessionCount += 1;
    }
    if (session.isOngoing) ongoingSessionCount += 1;
    if (readCapacityValidationEligible(session)) capacityValidationEligibleCount += 1;
    if (isStrongHvChargeSessionForH1(session)) strongSessionCount += 1;
    else weakSessionCount += 1;
  }

  return {
    totalSessions: sessions.length,
    nativeDimoSessionCount,
    fallbackSessionCount,
    ongoingSessionCount,
    strongSessionCount,
    weakSessionCount,
    capacityValidationEligibleCount,
  };
}
