import { resolveTelemetrySourceFamily } from '../../../telemetry-source-family';
import type { DiV0S4SourceFamily } from '../../s4a-foundation/di-v0-s4a-contract';
import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../../ds4-assessment/ds4-assessment-calibration-cohort.v1';
import {
  isDs4ProviderCapabilityRateableV1,
  resolveDs4ProviderCapabilityFromS4SourceFamilyV1,
  resolveDs4ProviderCapabilityFromTelemetrySourceFamilyV1,
} from '../di-v0-ds4-provider-capability.v1';

const TESLA_SOFTWARE_DIMO_RAW = { syntheticDevice: { integration: 'tesla' } };
const R1_DIMO_RAW = { aftermarketDevice: { serial: 'R1-CALIBRATION-0001' } };
const UNKNOWN_DIMO_RAW = { aftermarketDevice: { serial: 'OTHER-0001' } };

function s4FamilyFromDimoRaw(raw: unknown): DiV0S4SourceFamily {
  const telemetry = resolveTelemetrySourceFamily(raw);
  if (telemetry === 'RUPTELA_R1') return 'RUPTELA_R1';
  if (telemetry === 'API_SYNTHETIC') return 'API_SYNTHETIC';
  return 'UNKNOWN';
}

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

  it('maps Tesla software integration DIMO identity to API_SYNTHETIC SUPPORTED path', () => {
    const telemetry = resolveTelemetrySourceFamily(TESLA_SOFTWARE_DIMO_RAW);
    expect(telemetry).toBe('API_SYNTHETIC');
    const s4Family = s4FamilyFromDimoRaw(TESLA_SOFTWARE_DIMO_RAW);
    expect(s4Family).toBe('API_SYNTHETIC');
    expect(resolveDs4ProviderCapabilityFromS4SourceFamilyV1(s4Family).state).toBe('SUPPORTED');
  });

  it('maps calibration cohort R1 roles to SUPPORTED without hardcoded vehicle UUID gates', () => {
    for (const vehicle of DS4_ASSESSMENT_CALIBRATION_COHORT_V1) {
      if (vehicle.role === 'TESLA_MODEL_3_SOFTWARE_INTEGRATION') {
        const cap = resolveDs4ProviderCapabilityFromS4SourceFamilyV1(s4FamilyFromDimoRaw(TESLA_SOFTWARE_DIMO_RAW));
        expect(cap.state).toBe('SUPPORTED');
      } else {
        const cap = resolveDs4ProviderCapabilityFromS4SourceFamilyV1(s4FamilyFromDimoRaw(R1_DIMO_RAW));
        expect(cap.state).toBe('SUPPORTED');
      }
    }
  });

  it('UNKNOWN telemetry identity fails closed for rating without blocking SUPPORTED families', () => {
    expect(resolveTelemetrySourceFamily(UNKNOWN_DIMO_RAW)).toBe('UNKNOWN');
    expect(resolveDs4ProviderCapabilityFromS4SourceFamilyV1('API_SYNTHETIC').state).toBe('SUPPORTED');
    expect(isDs4ProviderCapabilityRateableV1(resolveDs4ProviderCapabilityFromS4SourceFamilyV1('UNKNOWN').state)).toBe(
      false,
    );
  });
});
