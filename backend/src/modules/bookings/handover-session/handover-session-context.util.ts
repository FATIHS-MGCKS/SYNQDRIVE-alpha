import type { PickupGateEvaluation } from '../booking-pickup-gate/booking-pickup-gate.types';
import type {
  HandoverSessionBlocker,
  HandoverSessionPayloadSnapshot,
} from './handover-session.types';

export function mapPickupGateToBlockers(
  evaluation: PickupGateEvaluation,
): HandoverSessionBlocker[] {
  return evaluation.requirements.map((req) => ({
    code: req.code,
    message: req.message,
    overridable: req.overridable,
    category: req.code.includes('ELIGIBILITY') ? 'eligibility' : 'gate',
  }));
}

export function extractPayloadSnapshot(
  payload: Record<string, unknown> | null | undefined,
): HandoverSessionPayloadSnapshot {
  const p = payload ?? {};
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  return {
    documentsAcknowledged: p.documentsAcknowledged === true,
    customerSignatureDataUrl: str(p.customerSignatureDataUrl),
    customerSignatureName: str(p.customerSignatureName),
    staffSignatureDataUrl: str(p.staffSignatureDataUrl),
    staffSignatureName: str(p.staffSignatureName),
    odometerKm: num(p.odometerKm),
  };
}

export function mergePayloadJson(
  existing: Record<string, unknown> | null,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!patch || Object.keys(patch).length === 0) {
    return existing ?? {};
  }
  return { ...(existing ?? {}), ...patch };
}

export function resolveWritableStation(
  access: { bypassScope: boolean; allowedStationIds: string[] | null },
  stationId: string | null,
): boolean {
  if (!stationId) return true;
  if (access.bypassScope || access.allowedStationIds === null) return true;
  return access.allowedStationIds.includes(stationId);
}
