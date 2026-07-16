import {
  canAloneSupportMisuseCase,
  validateDrivingEvidenceContract,
} from './driving-evidence.contract';
import type { CreateDrivingEvidenceInput } from './driving-evidence.types';

function baseInput(
  overrides: Partial<CreateDrivingEvidenceInput> = {},
): CreateDrivingEvidenceInput {
  return {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    sourceType: 'MEASURED_SIGNAL',
    strength: 'MEDIUM',
    observedAt: new Date('2026-07-16T10:00:00Z'),
    providerSource: 'DIMO_TELEMETRY',
    capabilityVersion: 'cap-v1',
    modelVersion: 'model-v1',
    coverage: 0.9,
    effectiveCadenceMs: 5000,
    confidence: 0.85,
    sourceEntity: { table: 'driving_events', id: 'evt-1' },
    context: { signalName: 'behavior.harshBraking', severity: 'HARD' },
    idempotencyKey: 'org-1:evt-1',
    ...overrides,
  };
}

describe('validateDrivingEvidenceContract', () => {
  it('accepts measured signal with bounded context', () => {
    const result = validateDrivingEvidenceContract(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.misuseCaseEligible).toBe(true);
    }
  });

  it('rejects estimated data marked as MEASURED_SIGNAL', () => {
    const result = validateDrivingEvidenceContract(
      baseInput({
        context: { measurementKind: 'estimated', signalName: 'avgEngineLoad' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'ESTIMATED_MARKED_AS_MEASURED')).toBe(true);
    }
  });

  it('requires PROVIDER_CLASSIFIED_EVENT for provider-native classification', () => {
    const hidden = validateDrivingEvidenceContract(
      baseInput({
        context: { classificationOrigin: 'provider_native', eventType: 'harshBraking' },
      }),
    );
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) {
      expect(hidden.issues.some((i) => i.code === 'PROVIDER_CLASSIFICATION_HIDDEN')).toBe(true);
    }

    const visible = validateDrivingEvidenceContract(
      baseInput({
        sourceType: 'PROVIDER_CLASSIFIED_EVENT',
        context: { classificationOrigin: 'provider_native', eventType: 'harshBraking' },
      }),
    );
    expect(visible.ok).toBe(true);
  });

  it('marks CONTEXT_SIGNAL as not misuse-case-eligible alone', () => {
    const result = validateDrivingEvidenceContract(
      baseInput({
        sourceType: 'CONTEXT_SIGNAL',
        sourceEntity: { table: 'driving_events', id: 'ctx-1', kind: 'contextAssessment' },
        context: { assessment: 'RPM_SPIKE_CONTEXT' },
        idempotencyKey: 'org-1:ctx-1',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.misuseCaseEligible).toBe(false);
    }
    expect(canAloneSupportMisuseCase('CONTEXT_SIGNAL')).toBe(false);
    expect(canAloneSupportMisuseCase('PROVIDER_CLASSIFIED_EVENT')).toBe(true);
  });

  it('rejects forbidden provider payload fields in context', () => {
    const result = validateDrivingEvidenceContract(
      baseInput({
        context: { rawPayload: { huge: 'provider blob' } } as unknown as CreateDrivingEvidenceInput['context'],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'FORBIDDEN_PAYLOAD_FIELD')).toBe(true);
    }
  });
});
