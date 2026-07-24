import {
  mapModuleHealthToDomainSlice,
  mapHealthStateToSeverity,
} from './ai-get-vehicle-health-summary.mapper';

describe('ai-get-vehicle-health-summary.mapper', () => {
  it('maps unknown health state to unknown severity', () => {
    expect(mapHealthStateToSeverity('unknown')).toBe('unknown');
    expect(mapHealthStateToSeverity('good')).toBe('info');
    expect(mapHealthStateToSeverity('critical')).toBe('critical');
  });

  it('marks stale module data as partial availability', () => {
    const slice = mapModuleHealthToDomainSlice({
      state: 'good',
      reason: 'OK',
      last_updated_at: new Date().toISOString(),
      data_stale: true,
      source: 'tires',
    });
    expect(slice.availability).toBe('partial');
    expect(slice.freshness).toBe('offline');
    expect(slice.isHistorical).toBe(true);
  });
});
