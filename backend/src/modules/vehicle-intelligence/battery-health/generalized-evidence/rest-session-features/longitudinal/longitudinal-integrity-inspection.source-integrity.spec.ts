import type { BatteryRestSessionFeature } from '@prisma/client';
import {
  buildD4ProfileSessionCandidates,
  evaluateD4SourceIntegrityForSession,
  isVerifiableSourceReference,
} from './longitudinal-integrity-inspection.source-integrity';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { buildLongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';

describe('longitudinal-integrity-inspection.source-integrity', () => {
  it('marks missing canonical source as SOURCE_ROW_MISSING', () => {
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
    const candidates = buildD4ProfileSessionCandidates({
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });
    const session = evaluateD4SourceIntegrityForSession(candidates[0], {
      organizationId: PROFILE_TEST_ORG,
      vehicleId: PROFILE_TEST_VEHICLE,
      revisionCreatedAt: new Date('2026-09-24T12:00:00.000Z'),
      selfIntegrityFailed: false,
      sourceRowsById: new Map<string, BatteryRestSessionFeature>(),
      aggregatesBySessionKey: new Map(),
      totalRowsBySessionKey: new Map(),
      latestRowsBySessionKey: new Map(),
    });
    expect(session.sourceEvidenceAvailability).toBe('MISSING');
    expect(session.reasons).toContain('SOURCE_ROW_MISSING');
    expect(isVerifiableSourceReference(session)).toBe(false);
  });
});
