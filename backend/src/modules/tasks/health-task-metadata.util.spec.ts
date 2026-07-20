import { BadRequestException } from '@nestjs/common';
import {
  healthTaskDedupKeyFromMetadata,
  readLegacyHealthTaskMetadata,
  sanitizeHealthTaskMetadata,
} from './health-task-metadata.util';

const VALID_SOURCE_FINDING_ID = 'a'.repeat(64);

function baseHealthMetadata(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'HEALTH',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    healthModule: 'tires',
    healthState: 'warning',
    origin: 'HEALTH_UI',
    ...overrides,
  };
}

describe('health-task-metadata.util', () => {
  it('strips embedded health read models without persisting payloads', () => {
    const result = sanitizeHealthTaskMetadata(
      baseHealthMetadata({
        tire_read_model: { wearEvidence: {} },
        modules: { battery: {} },
      }),
      { organizationId: 'org-1', vehicleId: 'veh-1', sourceType: 'HEALTH' },
    ) as Record<string, unknown>;

    expect(result.tire_read_model).toBeUndefined();
    expect(result.modules).toBeUndefined();
  });

  it('rejects raw DTC code lists in metadata', () => {
    expect(() =>
      sanitizeHealthTaskMetadata(baseHealthMetadata({ dtcCodes: ['P0420'] }), {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        sourceType: 'HEALTH',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates full finding identity when sourceFindingId is present', () => {
    const result = sanitizeHealthTaskMetadata(
      baseHealthMetadata({
        sourceFindingId: VALID_SOURCE_FINDING_ID,
        findingCode: 'PRESSURE_WARNING',
        sourceEntityType: 'rental_reason_code',
        sourceEntityId: 'pressure_warning',
        findingVersion: 'health-finding-identity-v1',
      }),
      { organizationId: 'org-1', vehicleId: 'veh-1', sourceType: 'HEALTH' },
    ) as Record<string, unknown>;

    expect(result.sourceFindingId).toBe(VALID_SOURCE_FINDING_ID);
    expect(result.findingCode).toBe('PRESSURE_WARNING');
    expect(result.findingVersion).toBe('health-finding-identity-v1');
  });

  it('rejects organizationId mismatch', () => {
    expect(() =>
      sanitizeHealthTaskMetadata(baseHealthMetadata({ organizationId: 'org-2' }), {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        sourceType: 'HEALTH',
      }),
    ).toThrow(/organizationId/);
  });

  it('rejects vehicleId mismatch against linked vehicle', () => {
    expect(() =>
      sanitizeHealthTaskMetadata(baseHealthMetadata({ vehicleId: 'veh-2' }), {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        sourceType: 'HEALTH',
      }),
    ).toThrow(/vehicleId/);
  });

  it('rejects DTC code used as sole global id', () => {
    expect(() =>
      sanitizeHealthTaskMetadata(
        baseHealthMetadata({
          healthModule: 'error_codes',
          findingCode: 'DTC_P0420',
          sourceEntityType: 'dtc_code',
          sourceEntityId: 'p0420',
        }),
        { organizationId: 'org-1', vehicleId: 'veh-1', sourceType: 'HEALTH' },
      ),
    ).toThrow(/sourceFindingId/);
  });

  it('rejects sourceFindingId equal to sourceEntityId', () => {
    const shared = 'a'.repeat(64);
    expect(() =>
      sanitizeHealthTaskMetadata(
        baseHealthMetadata({
          sourceFindingId: shared,
          findingCode: 'DTC_P0420',
          sourceEntityType: 'dtc_code',
          sourceEntityId: shared,
        }),
        { organizationId: 'org-1', vehicleId: 'veh-1', sourceType: 'HEALTH' },
      ),
    ).toThrow(/not equal sourceEntityId/);
  });

  it('allows legacy health tasks without sourceFindingId', () => {
    const result = sanitizeHealthTaskMetadata(baseHealthMetadata(), {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sourceType: 'HEALTH',
    }) as Record<string, unknown>;

    expect(result.sourceFindingId).toBeUndefined();
    expect(result.healthModule).toBe('tires');
    expect(readLegacyHealthTaskMetadata(result).healthModule).toBe('tires');
  });

  it('builds dedup key from sourceFindingId', () => {
    const key = healthTaskDedupKeyFromMetadata(
      baseHealthMetadata({ sourceFindingId: VALID_SOURCE_FINDING_ID }),
    );
    expect(key).toBe(`health:finding:${VALID_SOURCE_FINDING_ID}`);
  });
});
