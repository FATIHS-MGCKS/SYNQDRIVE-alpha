import {
  REFERENCE_CAPTURE_ENVELOPE_VERSION,
  REFERENCE_CAPTURE_RAW_IDENTITY_PREFIX,
} from './reference-capture.constants';
import {
  buildRawIdentity,
  normalizeReferenceCaptureObservationEnvelope,
  validateReferenceCaptureObservationEnvelope,
} from './reference-capture.contract';
import { ReferenceCaptureObservationKind } from '@prisma/client';

describe('reference-capture.contract', () => {
  const baseEnvelope = {
    envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
    observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
    provider: 'DIMO',
    connectionProfile: 'DIMO_LTE_R1',
    rawIdentity: buildRawIdentity('speed'),
    providerField: 'speed',
    canonicalKey: 'CAN_VEHICLE_SPEED',
    rawValue: { value: 42, unit: 'km/h' },
    synqReceivedAt: '2026-08-31T12:00:00.000Z',
    providerTimestamp: '2026-08-31T11:59:59.500Z',
    requestStartedAt: '2026-08-31T12:00:00.000Z',
    requestCompletedAt: '2026-08-31T12:00:00.100Z',
  };

  it('accepts canonical mapped envelope (RP-040)', () => {
    const result = validateReferenceCaptureObservationEnvelope(baseEnvelope);
    expect(result.ok).toBe(true);
  });

  it('accepts unmapped provider field with null canonicalKey', () => {
    const result = validateReferenceCaptureObservationEnvelope({
      ...baseEnvelope,
      providerField: 'unknownDiagnosticField',
      canonicalKey: null,
      rawIdentity: `${REFERENCE_CAPTURE_RAW_IDENTITY_PREFIX}unknownDiagnosticField`,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing synqReceivedAt (RP-039)', () => {
    const result = validateReferenceCaptureObservationEnvelope({
      ...baseEnvelope,
      synqReceivedAt: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'MISSING_SYNQ_RECEIVED_AT')).toBe(true);
    }
  });

  it('rejects unsupported envelope version', () => {
    const result = validateReferenceCaptureObservationEnvelope({
      ...baseEnvelope,
      envelopeVersion: '0.9.0',
    });
    expect(result.ok).toBe(false);
  });

  it('preserves distinct providerTimestamp and synqReceivedAt on normalize', () => {
    const normalized = normalizeReferenceCaptureObservationEnvelope(baseEnvelope);
    expect(normalized.providerTimestamp).toBeInstanceOf(Date);
    expect(normalized.synqReceivedAt).toBeInstanceOf(Date);
    const providerTs = normalized.providerTimestamp as Date;
    const synqTs = normalized.synqReceivedAt as Date;
    expect(providerTs.getTime()).toBeLessThan(synqTs.getTime());
  });
});
