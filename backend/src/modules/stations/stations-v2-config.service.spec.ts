import { StationsV2ConfigService } from './stations-v2-config.service';

describe('StationsV2ConfigService', () => {
  const service = new StationsV2ConfigService();

  it('exposes contract metadata', () => {
    const metadata = service.getContractMetadata();
    expect(metadata.version).toBe(1);
    expect(metadata.flags.stationsScopeV2Enabled).toBe('STATIONS_V2_SCOPE_ENABLED');
  });

  it('resolves effective flags for organization', () => {
    const flags = service.resolve('org-test');
    expect(flags.organizationId).toBe('org-test');
    expect(typeof flags.stationsUiV2Enabled).toBe('boolean');
  });
});
