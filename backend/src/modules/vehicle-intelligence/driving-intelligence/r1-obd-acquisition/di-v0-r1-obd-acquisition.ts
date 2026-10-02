import type { NormalizedR1ObdObservation, TelemetrySourceFamily } from '../core/types';
import { resolveDiV0SourceFamily } from '../position-acquisition/di-v0-position-source-family';
import { validateDiV0PositionAcquisitionRequest } from '../position-acquisition/di-v0-position-window';
import { buildR1ObdFailure, classifyDiV0R1ObdTransportError } from './di-v0-r1-obd-errors';
import { normalizeDiV0R1ObdResponse } from './di-v0-r1-obd-normalizer';
import { buildDiV0HistoricalR1ObdQuery } from './di-v0-r1-obd-query';
import type {
  DiV0HistoricalR1ObdTransport,
  DiV0R1ObdAcquisitionOptions,
  DiV0R1ObdAcquisitionOutcome,
  DiV0R1ObdAcquisitionRequest,
  DiV0R1ObdAcquisitionResult,
  R1ObdEvidence,
} from './di-v0-r1-obd-acquisition.types';
import { DI_V0_R1_OBD_DEFAULT_MAX_WINDOW_SECONDS } from './di-v0-r1-obd-acquisition.versions';

export function assertR1ObdSourceFamilyEligible(sourceFamily: TelemetrySourceFamily): boolean {
  return sourceFamily === 'RUPTELA_R1';
}

/**
 * S3B Channel A — dormant acquisition. No retries, no persistence, no kinematic authority.
 */
export async function acquireDiV0HistoricalR1Obd(
  request: DiV0R1ObdAcquisitionRequest,
  transport: DiV0HistoricalR1ObdTransport,
  options: DiV0R1ObdAcquisitionOptions = {},
): Promise<DiV0R1ObdAcquisitionOutcome> {
  let validated;
  try {
    validated = validateDiV0PositionAcquisitionRequest(request, options.maxWindowSeconds ?? DI_V0_R1_OBD_DEFAULT_MAX_WINDOW_SECONDS);
  } catch (error) {
    return { status: 'FAILED', failure: classifyDiV0R1ObdTransportError(error) };
  }

  const sourceFamilyResolution = resolveDiV0SourceFamily(validated.dimoDeviceIdentity);
  if (!assertR1ObdSourceFamilyEligible(sourceFamilyResolution.sourceFamily)) {
    return {
      status: 'FAILED',
      failure: buildR1ObdFailure(
        'UNSUPPORTED_SOURCE_FAMILY',
        `R1 OBD adapter requires RUPTELA_R1; got ${sourceFamilyResolution.sourceFamily}`,
      ),
    };
  }

  const query = buildDiV0HistoricalR1ObdQuery(validated.dimoTokenId, validated.window);
  let responseBody: unknown;
  try {
    responseBody = await transport.executeHistoricalR1ObdQuery({
      organizationId: validated.organizationId,
      vehicleId: validated.vehicleId,
      dimoTokenId: validated.dimoTokenId,
      query,
    });
  } catch (error) {
    return { status: 'FAILED', failure: classifyDiV0R1ObdTransportError(error) };
  }

  const normalized = normalizeDiV0R1ObdResponse({
    request: validated,
    sourceFamilyResolution,
    responseBody,
    longGapThresholdSeconds: options.longGapThresholdSeconds ?? 120,
  });
  return normalized.ok
    ? { status: 'ACQUIRED', result: normalized.result }
    : { status: 'FAILED', failure: normalized.failure };
}

export function toDiV0S1R1ObdInput(result: DiV0R1ObdAcquisitionResult): NormalizedR1ObdObservation[] {
  return result.observations;
}

export function wrapR1ObdEvidence(result: DiV0R1ObdAcquisitionResult): R1ObdEvidence {
  return { channel: 'R1_HISTORICAL_OBD', result };
}
