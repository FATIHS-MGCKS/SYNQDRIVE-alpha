import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';

export const PROVIDER_CANDIDATE_CURSOR_VERSION = 1;

/** Cursor-only sentinel: resume HIGH_MOBILITY phase from the first mirror (not a real row id). */
export const HM_CANDIDATE_PHASE_START_MIRROR_ID = '00000000-0000-4000-8000-000000000000';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROVIDER_PHASES = new Set(['DIMO', 'HIGH_MOBILITY']);
const CURSOR_MODES = new Set(['COMBINED', 'DIMO', 'HIGH_MOBILITY']);

export type ProviderCandidateCursorPhase = 'DIMO' | 'HIGH_MOBILITY';

export type ProviderCandidateListCursor = {
  version: typeof PROVIDER_CANDIDATE_CURSOR_VERSION;
  mode: 'COMBINED' | SourceClaimProvider;
  phase: ProviderCandidateCursorPhase;
  sourceMirrorId: string;
};

type WireCursorV1 = {
  v?: unknown;
  m?: unknown;
  p?: unknown;
  i?: unknown;
};

function assertWireObject(value: unknown): WireCursorV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  const keys = Object.keys(value as object);
  const allowed = new Set(['v', 'm', 'p', 'i']);
  if (keys.length !== 4 || keys.some((k) => !allowed.has(k))) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  return value as WireCursorV1;
}

export function encodeProviderCandidateListCursor(state: ProviderCandidateListCursor): string {
  const payload = JSON.stringify({
    v: state.version,
    m: state.mode,
    p: state.phase,
    i: state.sourceMirrorId,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeProviderCandidateListCursor(
  encoded: string,
  providerFilter?: SourceClaimProvider,
): ProviderCandidateListCursor {
  if (!encoded || encoded.length > 512) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  let json: string;
  try {
    json = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  if (json.length > 256) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  let wire: WireCursorV1;
  try {
    wire = assertWireObject(JSON.parse(json));
  } catch (error) {
    if (error instanceof VehicleOnboardingError) {
      throw error;
    }
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }

  if (wire.v !== PROVIDER_CANDIDATE_CURSOR_VERSION) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  if (typeof wire.m !== 'string' || !CURSOR_MODES.has(wire.m)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  if (typeof wire.p !== 'string' || !PROVIDER_PHASES.has(wire.p)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  if (typeof wire.i !== 'string' || !UUID_RE.test(wire.i)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }

  const mode = wire.m as ProviderCandidateListCursor['mode'];
  const phase = wire.p as ProviderCandidateCursorPhase;

  if (mode === 'DIMO' && phase !== 'DIMO') {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }
  if (mode === 'HIGH_MOBILITY' && phase !== 'HIGH_MOBILITY') {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }

  if (providerFilter === 'DIMO') {
    if (mode !== 'DIMO') {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
    }
  } else if (providerFilter === 'HIGH_MOBILITY') {
    if (mode !== 'HIGH_MOBILITY') {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
    }
  } else if (mode !== 'COMBINED') {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid cursor');
  }

  return {
    version: PROVIDER_CANDIDATE_CURSOR_VERSION,
    mode,
    phase,
    sourceMirrorId: wire.i,
  };
}

export function scanAfterMirrorId(cursor: ProviderCandidateListCursor | undefined): string | undefined {
  if (!cursor) {
    return undefined;
  }
  if (
    cursor.phase === 'HIGH_MOBILITY' &&
    cursor.sourceMirrorId === HM_CANDIDATE_PHASE_START_MIRROR_ID
  ) {
    return undefined;
  }
  return cursor.sourceMirrorId;
}

export function combinedCursor(
  phase: ProviderCandidateCursorPhase,
  lastScannedMirrorId: string,
): string {
  return encodeProviderCandidateListCursor({
    version: PROVIDER_CANDIDATE_CURSOR_VERSION,
    mode: 'COMBINED',
    phase,
    sourceMirrorId: lastScannedMirrorId,
  });
}

export function providerScopedCursor(
  provider: SourceClaimProvider,
  lastScannedMirrorId: string,
): string {
  return encodeProviderCandidateListCursor({
    version: PROVIDER_CANDIDATE_CURSOR_VERSION,
    mode: provider,
    phase: provider,
    sourceMirrorId: lastScannedMirrorId,
  });
}

export function hmPhaseStartCursor(): string {
  return combinedCursor('HIGH_MOBILITY', HM_CANDIDATE_PHASE_START_MIRROR_ID);
}
