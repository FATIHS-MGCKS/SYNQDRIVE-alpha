import { REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION } from '../rest-session-feature.constants';
import { parseHistoricalFeatureInputSummaryForD4 } from './longitudinal-historical-input-summary.parser';

describe('parseHistoricalFeatureInputSummaryForD4', () => {
  const identity = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    vehicleId: '22222222-2222-2222-2222-222222222222',
    restSessionId: 'session-1',
  };

  const validSummary = {
    organizationId: identity.organizationId,
    vehicleId: identity.vehicleId,
    restSessionId: identity.restSessionId,
    inputContractVersion: REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
    anchorResolution: { status: 'SELECTED' },
    chargeOpportunityRaw: {
      contextCompleteness: [],
      temperatureC: null,
      temperatureSource: 'UNKNOWN',
    },
  };

  it('parses registered M3_3C contract', () => {
    const outcome = parseHistoricalFeatureInputSummaryForD4({
      ...identity,
      inputSummary: validSummary,
      expectedInputContractVersion: REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
    });
    expect(outcome.status).toBe('OK');
  });

  it('returns UNSUPPORTED for unknown matching contract', () => {
    const outcome = parseHistoricalFeatureInputSummaryForD4({
      ...identity,
      inputSummary: { ...validSummary, inputContractVersion: 'FUTURE_CONTRACT_V9' },
      expectedInputContractVersion: 'FUTURE_CONTRACT_V9',
    });
    expect(outcome).toEqual({
      status: 'UNSUPPORTED_SOURCE_INPUT_CONTRACT',
      inputContractVersion: 'FUTURE_CONTRACT_V9',
    });
  });

  it('returns UNRESOLVED when persisted contract version missing', () => {
    const outcome = parseHistoricalFeatureInputSummaryForD4({
      ...identity,
      inputSummary: { ...validSummary, inputContractVersion: undefined },
      expectedInputContractVersion: REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
    });
    expect(outcome.status).toBe('UNRESOLVED');
  });

  it('returns UNRESOLVED when expected version differs from persisted summary', () => {
    const outcome = parseHistoricalFeatureInputSummaryForD4({
      ...identity,
      inputSummary: validSummary,
      expectedInputContractVersion: 'OTHER_VERSION',
    });
    expect(outcome.status).toBe('UNRESOLVED');
  });
});
