import { parseLongitudinalInputSnapshotSummary } from './longitudinal-input.snapshot-parser';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';

describe('longitudinal-input.snapshot-parser (D1)', () => {
  const org = '11111111-1111-1111-1111-111111111111';
  const vehicle = '22222222-2222-2222-2222-222222222222';
  const session = '33333333-3333-3333-3333-333333333333';

  it('parses valid M3_3C_FEATURE_INPUT_V1 snapshot', () => {
    const summary = buildMinimalLongitudinalInputSummary({
      organizationId: org,
      vehicleId: vehicle,
      restSessionId: session,
      anchorResolutionStatus: 'AMBIGUOUS',
    });
    const parsed = parseLongitudinalInputSnapshotSummary({
      inputSummary: summary,
      organizationId: org,
      vehicleId: vehicle,
      restSessionId: session,
    });
    expect(parsed.status).toBe('OK');
    if (parsed.status === 'OK') {
      expect(parsed.parsed.inputContractVersion).toBe('M3_3C_FEATURE_INPUT_V1');
      expect(parsed.parsed.anchorResolutionStatus).toBe('AMBIGUOUS');
    }
  });

  it('returns UNRESOLVED for malformed JSON', () => {
    expect(
      parseLongitudinalInputSnapshotSummary({
        inputSummary: null,
        organizationId: org,
        vehicleId: vehicle,
        restSessionId: session,
      }).status,
    ).toBe('UNRESOLVED');
  });

  it('returns UNRESOLVED for tenant mismatch', () => {
    const summary = buildMinimalLongitudinalInputSummary({
      organizationId: org,
      vehicleId: vehicle,
      restSessionId: session,
    });
    expect(
      parseLongitudinalInputSnapshotSummary({
        inputSummary: summary,
        organizationId: org,
        vehicleId: '00000000-0000-0000-0000-000000000099',
        restSessionId: session,
      }).status,
    ).toBe('UNRESOLVED');
  });
});
