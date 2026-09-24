import type { BatteryRestSessionFeature } from '@prisma/client';
import { aggregateD4InspectionOverlay } from './longitudinal-integrity-inspection.aggregate';
import type { D4PerSessionInspectionV1 } from './longitudinal-integrity-inspection.types';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { buildLongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';

function baseInspection(perSession: D4PerSessionInspectionV1[]) {
  const assembled = assembleLongitudinalProfileV1({
    inventory: buildProfileTestInventory([
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ]),
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  });
  if (assembled.status !== 'OK') throw new Error(assembled.reason);
  const projection = buildLongitudinalScientificProfileProjectionV1(assembled.profile);
  return aggregateD4InspectionOverlay({
    projection,
    revisionId: 'rev-1',
    canonicalProfileFingerprint: 'a'.repeat(64),
    inspectionGeneratedAt: '2026-09-24T12:00:00.000Z',
    selfIntegrityFailed: false,
    selfIntegrityReasons: [],
    batchContext: {
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      revisionCreatedAt: new Date('2026-09-24T12:00:00.000Z'),
      selfIntegrityFailed: false,
      sourceRowsById: new Map<string, BatteryRestSessionFeature>(),
      aggregatesBySessionKey: new Map(),
      totalRowsBySessionKey: new Map(),
      latestRowsBySessionKey: new Map(),
    },
  });
}

describe('aggregateD4InspectionOverlay', () => {
  it('defaults to OK when no warnings', () => {
    const inspection = baseInspection([]);
    expect(inspection.profile.overallStatus).toBe('SOURCE_EVIDENCE_LIMITED');
    expect(inspection.profile.defaultObservationCount).toBe(1);
    expect(
      inspection.profile.integrityQualifiedDefaultCount +
        inspection.profile.quarantinedIntegrityWarningDefaultCount +
        inspection.profile.sourceEvidenceLimitedDefaultCount +
        inspection.profile.notEligibleRevisionSelfIntegrityFailedDefaultCount,
    ).toBe(inspection.profile.defaultObservationCount);
  });
});
