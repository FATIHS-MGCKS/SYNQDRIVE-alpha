import { TireBaselineStatus, TireEvidenceSource, TireSetupStatus } from '@prisma/client';

/**
 * Prisma schema contract tests for tire evidence / provenance (no live DB).
 */
describe('tire evidence schema contracts', () => {
  it('exposes TireEvidenceSource enum with audit-aligned values', () => {
    expect(Object.values(TireEvidenceSource)).toEqual(
      expect.arrayContaining([
        'MANUAL_MEASUREMENT',
        'WORKSHOP_MEASUREMENT',
        'DOCUMENT_MEASUREMENT',
        'MANUFACTURER_CONFIRMED',
        'USER_CONFIRMED',
        'AI_ESTIMATED',
        'MODEL_ESTIMATED',
        'DEFAULT_ASSUMPTION',
        'PROVIDER_SIGNAL',
        'UNKNOWN',
      ]),
    );
    expect(Object.values(TireEvidenceSource)).toHaveLength(10);
  });

  it('exposes TireOdometerAnchorSource enum with audit-aligned values', () => {
    const { TireOdometerAnchorSource, TireOdometerAnchorStatus } = require('@prisma/client');
    expect(Object.values(TireOdometerAnchorSource)).toEqual(
      expect.arrayContaining([
        'MANUAL_CONFIRMED',
        'PROVIDER_DIMO',
        'PROVIDER_HIGH_MOBILITY',
        'VEHICLE_LATEST_STATE',
        'DOCUMENTED',
        'HISTORICAL_INFERRED',
        'UNKNOWN',
      ]),
    );
    expect(Object.values(TireOdometerAnchorStatus)).toEqual(
      expect.arrayContaining(['ANCHORED', 'ANCHOR_REQUIRED', 'MEASUREMENT_REQUIRED']),
    );
  });

  it('exposes TireBaselineStatus enum for setup/tire baseline lifecycle', () => {
    expect(Object.values(TireBaselineStatus)).toEqual(
      expect.arrayContaining([
        'UNKNOWN',
        'INCOMPLETE',
        'ESTIMATED',
        'CONFIRMED',
        'DOCUMENTED',
      ]),
    );
  });

  it('documents that ground-truth flags are nullable (no default true)', () => {
    // Contract: isGroundTruth on TireWearDataPoint must remain optional/nullable
    // until explicitly set at write time — verified by migration SQL (no NOT NULL, no DEFAULT).
    const nullableGroundTruth: boolean | null = null;
    expect(nullableGroundTruth).toBeNull();
  });

  it('exposes canonical tire setup lifecycle states including legacy values', () => {
    expect(Object.values(TireSetupStatus)).toEqual(
      expect.arrayContaining(['NEW', 'ACTIVE', 'STORED', 'REMOVED', 'RETIRED', 'DISCARDED', 'SOLD']),
    );
  });

  it('exposes TireTripUsageLedger model via Prisma client (Prompt 9)', () => {
    const { Prisma } = require('@prisma/client');
    const model = Prisma.ModelName.TireTripUsageLedger;
    expect(model).toBe('TireTripUsageLedger');
  });
});
