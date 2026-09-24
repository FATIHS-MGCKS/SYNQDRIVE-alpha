import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { buildLongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
} from './longitudinal-profile.test-fixtures';
import { parseLongitudinalScientificProfileProjectionV1 } from './longitudinal-scientific-profile.parser';

function validProjection() {
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
  return buildLongitudinalScientificProfileProjectionV1(assembled.profile);
}

describe('parseLongitudinalScientificProfileProjectionV1 (M3.3D D4)', () => {
  it('accepts assembled scientific projection', () => {
    const projection = validProjection();
    const parsed = parseLongitudinalScientificProfileProjectionV1(projection);
    expect(parsed).toEqual({ status: 'OK', projection });
  });

  it('rejects unsupported contract', () => {
    const projection = validProjection();
    const parsed = parseLongitudinalScientificProfileProjectionV1({
      ...projection,
      longitudinalProfileContractVersion: 'UNKNOWN',
    });
    expect(parsed).toEqual({ status: 'FAILED', reason: 'UNSUPPORTED_PROFILE_CONTRACT' });
  });

  it('rejects unsupported policy', () => {
    const projection = validProjection();
    const parsed = parseLongitudinalScientificProfileProjectionV1({
      ...projection,
      profilePolicyVersion: 'UNKNOWN',
    });
    expect(parsed).toEqual({ status: 'FAILED', reason: 'UNSUPPORTED_PROFILE_POLICY_VERSION' });
  });

  it('rejects profileGeneratedAt inside window', () => {
    const projection = validProjection();
    const parsed = parseLongitudinalScientificProfileProjectionV1({
      ...projection,
      window: {
        ...projection.window,
        profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
      },
    });
    expect(parsed).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
  });

  it('rejects partition count mismatch', () => {
    const projection = validProjection();
    const parsed = parseLongitudinalScientificProfileProjectionV1({
      ...projection,
      coverage: { ...projection.coverage, candidateRestSessionCount: 99 },
    });
    expect(parsed).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
  });

  it('rejects duplicate restSessionId across slices', () => {
    const projection = validProjection();
    const dup = { ...projection.observations[0], restSessionId: 'dup' };
    const parsed = parseLongitudinalScientificProfileProjectionV1({
      ...projection,
      observations: [dup],
      provisionalObservations: [{ ...dup }],
      coverage: {
        ...projection.coverage,
        candidateRestSessionCount: 2,
        includedSessionCount: 1,
        provisionalSessionCount: 1,
      },
    });
    expect(parsed).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
  });

  it('rejects non-null derived', () => {
    const projection = validProjection();
    const parsed = parseLongitudinalScientificProfileProjectionV1({
      ...projection,
      derived: { unexpected: true },
    });
    expect(parsed).toEqual({ status: 'FAILED', reason: 'MALFORMED_SCIENTIFIC_PROFILE' });
  });

  it('rejects wrong contract constants on happy path envelope', () => {
    expect(REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION).toBe('M3_3D_LONGITUDINAL_PROFILE_V1');
    expect(REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION).toBe('M3_3D_PROFILE_POLICY_V1');
  });
});
