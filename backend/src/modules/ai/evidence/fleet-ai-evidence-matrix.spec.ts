import { AI_EVIDENCE_REASON_CODES } from './ai-evidence.enums';
import {
  createCalculatedAiEvidence,
  createObservedAiEvidence,
  createPermissionDeniedAiEvidence,
  createStaleObservedAiEvidence,
  createUnavailableAiEvidence,
} from './ai-evidence.factory';
import { validateAiEvidence } from './ai-evidence.validation';
import { mapEvidenceReasonCodeToDomainErrorCode } from './ai-domain-error.serialization';
import { FLEET_AI_ORG_ID, FLEET_AI_VEHICLE_TIGUAN_A } from '../__fixtures__/fleet-ai-test.fixtures';

const VEHICLE_ID = FLEET_AI_VEHICLE_TIGUAN_A;

function baseObservedInput() {
  return {
    tenantId: FLEET_AI_ORG_ID,
    entityId: VEHICLE_ID,
    source: 'vehicle_latest_state' as const,
    sourceEntity: { kind: 'vehicle' as const, id: VEHICLE_ID },
    freshness: 'live' as const,
    confidence: 'high' as const,
    availability: 'available' as const,
    reasonCode: 'ok' as const,
    sensitivity: 'internal' as const,
    value: { odometerKm: 42_500 },
    observedAt: '2026-07-24T10:00:00.000Z',
  };
}

const MAPPED_REASON_CODES = AI_EVIDENCE_REASON_CODES.filter(
  (code) => code !== 'ok' && code !== 'partial_data',
);

describe('Fleet AI evidence contract matrix', () => {
  describe('freshness × availability combinations', () => {
    it.each([
      ['live', 'available', 'ok', { odometerKm: 42_500 }],
      ['signal_delayed', 'partial', 'partial_data', { fuelPercent: 55 }],
      ['offline', 'unavailable', 'provider_outage', null],
      ['standby', 'partial', 'signal_not_supported', { speedKmh: 0 }],
    ] as const)(
      'accepts observed evidence with freshness=%s availability=%s reason=%s',
      (freshness, availability, reasonCode, value) => {
        const evidence = createObservedAiEvidence({
          ...baseObservedInput(),
          freshness,
          availability,
          reasonCode,
          value,
        });
        expect(validateAiEvidence(evidence).valid).toBe(true);
      },
    );
  });

  describe('confidence levels', () => {
    it.each(['high', 'medium', 'low'] as const)('accepts confidence=%s', (confidence) => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        confidence,
      });
      expect(validateAiEvidence(evidence).valid).toBe(true);
    });
  });

  describe('calculated and stale evidence', () => {
    it('accepts calculated evidence with calculatedAt', () => {
      const evidence = createCalculatedAiEvidence({
        ...baseObservedInput(),
        source: 'calculated_derivation',
        calculatedAt: '2026-07-24T10:05:00.000Z',
        value: { fuelPercent: 62 },
      });
      expect(validateAiEvidence(evidence).valid).toBe(true);
    });

    it('accepts stale observed evidence', () => {
      const evidence = createStaleObservedAiEvidence({
        ...baseObservedInput(),
        freshness: 'signal_delayed',
        availability: 'partial',
        reasonCode: 'stale_data',
      });
      expect(validateAiEvidence(evidence).valid).toBe(true);
    });
  });

  describe('permission_denied and unavailable', () => {
    it('rejects permission_denied evidence that exposes raw values', () => {
      const evidence = createPermissionDeniedAiEvidence({
        tenantId: FLEET_AI_ORG_ID,
        entityId: VEHICLE_ID,
        source: 'vehicle_latest_state',
        sourceEntityKind: 'vehicle',
      });
      const bad = { ...evidence, value: { secret: 'leak' } };
      const result = validateAiEvidence(bad);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.path === 'value')).toBe(true);
    });

    it('accepts unavailable with null value', () => {
      const evidence = createUnavailableAiEvidence({
        tenantId: FLEET_AI_ORG_ID,
        entityId: VEHICLE_ID,
        source: 'vehicle_latest_state',
        sourceEntityKind: 'vehicle',
        reasonCode: 'data_unavailable',
      });
      expect(validateAiEvidence(evidence).valid).toBe(true);
    });
  });

  describe('reasonCode → domain error mapping', () => {
    it.each(MAPPED_REASON_CODES)('maps evidence reason %s to a domain error', (reasonCode) => {
      const domainCode = mapEvidenceReasonCodeToDomainErrorCode(reasonCode);
      expect(domainCode).toBeTruthy();
      expect(typeof domainCode).toBe('string');
    });

    it('documents partial_data as intentionally unmapped', () => {
      expect(mapEvidenceReasonCodeToDomainErrorCode('partial_data')).toBeNull();
    });
  });

  describe('data classification (sensitivity)', () => {
    it('rejects restricted evidence with embedded PII for LLM export', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        sensitivity: 'restricted',
        value: { customerEmail: 'driver@example.com' },
      });
      const result = validateAiEvidence(evidence, { forLlm: true });
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.path === 'value')).toBe(true);
    });

    it('accepts internal sensitivity for operator channel', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        sensitivity: 'internal',
      });
      expect(validateAiEvidence(evidence, { forLlm: false }).valid).toBe(true);
    });
  });
});
