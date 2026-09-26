import type { NormalizedPositionObservation, TelemetrySourceFamily } from '../core/types';
import type {
  DiV0HistoricalPositionTransport,
  DiV0PositionAcquisitionOptions,
  DiV0PositionAcquisitionOutcome,
  DiV0PositionAcquisitionRequest,
  DiV0PositionAcquisitionResult,
} from './di-v0-position-acquisition.types';
import { classifyDiV0PositionTransportError } from './di-v0-position-errors';
import { normalizeDiV0PositionResponse } from './di-v0-position-normalizer';
import { buildDiV0HistoricalPositionQuery } from './di-v0-position-query';
import { resolveDiV0SourceFamily } from './di-v0-position-source-family';
import { validateDiV0PositionAcquisitionRequest } from './di-v0-position-window';

/**
 * S3A dormant acquisition: validate → resolve source family → one provider query → normalize.
 * Never retries (the DIMO request executor owns transient retries), never persists, never
 * interprets hold/release/motion.
 */
export async function acquireDiV0HistoricalPositions(
  request: DiV0PositionAcquisitionRequest,
  transport: DiV0HistoricalPositionTransport,
  options: DiV0PositionAcquisitionOptions = {},
): Promise<DiV0PositionAcquisitionOutcome> {
  let validated;
  try {
    validated = validateDiV0PositionAcquisitionRequest(request, options.maxWindowSeconds);
  } catch (error) {
    return { status: 'FAILED', failure: classifyDiV0PositionTransportError(error) };
  }

  const sourceFamilyResolution = resolveDiV0SourceFamily(validated.dimoDeviceIdentity);
  const query = buildDiV0HistoricalPositionQuery(validated.dimoTokenId, validated.window);

  let responseBody: unknown;
  try {
    responseBody = await transport.executeHistoricalPositionQuery({
      organizationId: validated.organizationId,
      vehicleId: validated.vehicleId,
      dimoTokenId: validated.dimoTokenId,
      query,
    });
  } catch (error) {
    return { status: 'FAILED', failure: classifyDiV0PositionTransportError(error) };
  }

  const normalized = normalizeDiV0PositionResponse({
    request: validated,
    sourceFamilyResolution,
    responseBody,
    acquiredAt: (options.now ?? (() => new Date()))(),
  });
  return normalized.ok
    ? { status: 'ACQUIRED', result: normalized.result }
    : { status: 'FAILED', failure: normalized.failure };
}

/** Shape consumed by S1 `computeDiV0TripIntervals` (positions only; speed is a later S3 slice). */
export function toDiV0S1PositionInput(result: DiV0PositionAcquisitionResult): {
  sourceFamily: TelemetrySourceFamily;
  positions: NormalizedPositionObservation[];
} {
  return { sourceFamily: result.sourceFamily, positions: result.observations };
}
