import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AiEvidenceDto, validateAiEvidenceDto } from './ai-evidence.dto';
import {
  createCalculatedAiEvidence,
  createObservedAiEvidence,
  createPermissionDeniedAiEvidence,
  createStaleObservedAiEvidence,
  createStaticAiEvidence,
  createUnavailableAiEvidence,
} from './ai-evidence.factory';
import { serializeAiEvidenceForLlm } from './ai-evidence.serialization';
import { assertValidAiEvidence, validateAiEvidence } from './ai-evidence.validation';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';

function baseObservedInput() {
  return {
    tenantId: TENANT_ID,
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

describe('AI Evidence model', () => {
  describe('validateAiEvidence', () => {
    it('accepts valid observed evidence', () => {
      const evidence = createObservedAiEvidence(baseObservedInput());
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(() => assertValidAiEvidence(evidence)).not.toThrow();
    });

    it('accepts valid calculated evidence', () => {
      const evidence = createCalculatedAiEvidence({
        ...baseObservedInput(),
        source: 'calculated_derivation',
        value: { fuelPercent: 62 },
        observedAt: '2026-07-24T10:00:00.000Z',
        calculatedAt: '2026-07-24T10:05:00.000Z',
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(true);
    });

    it('accepts valid static knowledge-base evidence', () => {
      const evidence = createStaticAiEvidence({
        tenantId: TENANT_ID,
        entityId: TENANT_ID,
        source: 'knowledge_base',
        sourceEntity: { kind: 'organization', id: TENANT_ID },
        confidence: 'high',
        availability: 'available',
        reasonCode: 'ok',
        sensitivity: 'public',
        value: { description: 'Booking status CONFIRMED means pickup is scheduled.' },
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(true);
    });

    it('rejects missing tenantId', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        tenantId: '',
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.path === 'tenantId' && i.code === 'invalid_tenant')).toBe(
        true,
      );
    });

    it('rejects invalid tenant UUID format', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        tenantId: 'not-a-uuid',
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'invalid_tenant')).toBe(true);
    });

    it('models unavailable evidence with null value', () => {
      const evidence = createUnavailableAiEvidence({
        tenantId: TENANT_ID,
        entityId: VEHICLE_ID,
        source: 'vehicle_latest_state',
        sourceEntityKind: 'vehicle',
        reasonCode: 'data_unavailable',
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(true);
      expect(evidence.availability).toBe('unavailable');
      expect(evidence.value).toBeNull();
      expect(evidence.reasonCode).toBe('data_unavailable');
    });

    it('rejects unavailable evidence with non-null value', () => {
      const evidence = createUnavailableAiEvidence({
        tenantId: TENANT_ID,
        entityId: VEHICLE_ID,
        source: 'vehicle_latest_state',
        sourceEntityKind: 'vehicle',
      });
      const invalid = { ...evidence, value: { odometerKm: 1 } };
      const result = validateAiEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'data_unavailable')).toBe(true);
    });

    it('flags stale freshness combined with available/ok', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        freshness: 'offline',
        availability: 'available',
        reasonCode: 'ok',
        observedAt: '2026-06-01T10:00:00.000Z',
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'stale_data')).toBe(true);
    });

    it('accepts stale evidence via factory helper', () => {
      const evidence = createStaleObservedAiEvidence({
        ...baseObservedInput(),
        freshness: 'signal_delayed',
        observedAt: '2026-06-01T10:00:00.000Z',
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(true);
      expect(evidence.availability).toBe('partial');
      expect(evidence.reasonCode).toBe('stale_data');
      expect(evidence.warnings).toContain('data_may_be_stale');
    });

    it('models permission_denied without exposing raw values', () => {
      const evidence = createPermissionDeniedAiEvidence({
        tenantId: TENANT_ID,
        entityId: VEHICLE_ID,
        source: 'customer_service',
        sourceEntityKind: 'customer',
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(true);
      expect(evidence.availability).toBe('permission_denied');
      expect(evidence.reasonCode).toBe('permission_denied');
      expect(evidence.value).toBeNull();
    });

    it('rejects permission_denied with raw value payload', () => {
      const evidence = createPermissionDeniedAiEvidence({
        tenantId: TENANT_ID,
        entityId: VEHICLE_ID,
        source: 'customer_service',
        sourceEntityKind: 'customer',
      });
      const invalid = { ...evidence, value: { email: 'driver@example.com' } };
      const result = validateAiEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'permission_denied')).toBe(true);
    });

    it('rejects inconsistent timestamps (calculated before observed)', () => {
      const evidence = createCalculatedAiEvidence({
        ...baseObservedInput(),
        source: 'calculated_derivation',
        observedAt: '2026-07-24T12:00:00.000Z',
        calculatedAt: '2026-07-24T10:00:00.000Z',
        value: { deltaKm: 12 },
      });
      const result = validateAiEvidence(evidence);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'timestamp_inconsistent')).toBe(true);
    });

    it('enforces sensitivity classification for LLM export', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        sensitivity: 'pii',
        value: { email: 'fleet.manager@example.com' },
      });
      const internal = validateAiEvidence(evidence);
      expect(internal.valid).toBe(true);

      const forLlm = validateAiEvidence(evidence, { forLlm: true });
      expect(forLlm.valid).toBe(false);
      expect(forLlm.issues.some((i) => i.code === 'sensitivity_redacted')).toBe(true);
    });

    it('allows redacted PII values for LLM export', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        sensitivity: 'pii',
        value: { email: 'f***@example.com [REDACTED]' },
      });
      const result = validateAiEvidence(evidence, { forLlm: true });
      expect(result.valid).toBe(true);
    });

    it('redacts PII via serializeAiEvidenceForLlm', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        sensitivity: 'restricted',
        value: { phone: '+49 170 1234567' },
      });
      const safe = serializeAiEvidenceForLlm(evidence);
      expect(safe.value).toEqual({ phone: '[REDACTED]' });
      expect(safe.reasonCode).toBe('sensitivity_redacted');
      expect(safe.warnings).toContain('value_redacted_for_llm');
      expect(validateAiEvidence(safe, { forLlm: true }).valid).toBe(true);
    });
  });

  describe('AiEvidenceDto boundary validation', () => {
    it('validates DTO shape with class-validator and semantic rules', () => {
      const evidence = createObservedAiEvidence(baseObservedInput());
      const dto = plainToInstance(AiEvidenceDto, evidence);
      const structural = validateSync(dto);
      expect(structural).toHaveLength(0);

      const semantic = validateAiEvidenceDto(dto);
      expect(semantic.valid).toBe(true);
    });

    it('fails DTO semantic validation when tenantId is missing', () => {
      const evidence = createObservedAiEvidence({
        ...baseObservedInput(),
        tenantId: '',
      });
      const dto = plainToInstance(AiEvidenceDto, evidence);
      const semantic = validateAiEvidenceDto(dto);
      expect(semantic.valid).toBe(false);
      expect(semantic.issues.some((i) => i.code === 'invalid_tenant')).toBe(true);
    });
  });
});
