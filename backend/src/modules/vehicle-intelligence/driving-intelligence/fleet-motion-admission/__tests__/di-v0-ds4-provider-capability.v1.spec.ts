import {
  isDs4ProviderCapabilityRateableV1,
  resolveDs4ProviderCapabilityFromS4SourceFamilyV1,
  resolveDs4ProviderCapabilityFromTelemetrySourceFamilyV1,
} from '../di-v0-ds4-provider-capability.v1';

describe('DS4_PROVIDER_CAPABILITY_CONTRACT_V1', () => {
  it('marks R1 and API synthetic as SUPPORTED', () => {
    expect(resolveDs4ProviderCapabilityFromS4SourceFamilyV1('RUPTELA_R1').state).toBe('SUPPORTED');
    expect(resolveDs4ProviderCapabilityFromS4SourceFamilyV1('API_SYNTHETIC').state).toBe('SUPPORTED');
    expect(resolveDs4ProviderCapabilityFromTelemetrySourceFamilyV1('RUPTELA_R1').state).toBe('SUPPORTED');
    expect(resolveDs4ProviderCapabilityFromTelemetrySourceFamilyV1('API_SYNTHETIC').state).toBe('SUPPORTED');
  });

  it('marks UNKNOWN as not rateable', () => {
    expect(resolveDs4ProviderCapabilityFromS4SourceFamilyV1('UNKNOWN').state).toBe('UNKNOWN');
    expect(isDs4ProviderCapabilityRateableV1('UNKNOWN')).toBe(false);
  });
});
