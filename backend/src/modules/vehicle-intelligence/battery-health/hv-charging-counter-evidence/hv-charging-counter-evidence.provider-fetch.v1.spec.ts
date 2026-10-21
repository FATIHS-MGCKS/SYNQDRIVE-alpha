import { classifyDimoIntervalGraphqlPayload } from './hv-charging-counter-evidence.provider-fetch.v1';

describe('classifyDimoIntervalGraphqlPayload', () => {
  it('classifies missing signals array as invalid shape', () => {
    expect(classifyDimoIntervalGraphqlPayload({})).toEqual({
      status: 'invalid_response_shape',
      rows: [],
    });
  });

  it('classifies empty signals as empty interval series', () => {
    expect(classifyDimoIntervalGraphqlPayload({ signals: [] })).toEqual({
      status: 'empty_interval_series',
      rows: [],
    });
  });

  it('classifies non-empty signals as success', () => {
    const rows = [{ timestamp: '2026-10-16T13:15:02.931Z', addedKwhLast: 0 }];
    expect(classifyDimoIntervalGraphqlPayload({ signals: rows })).toEqual({
      status: 'success',
      rows,
    });
  });
});
