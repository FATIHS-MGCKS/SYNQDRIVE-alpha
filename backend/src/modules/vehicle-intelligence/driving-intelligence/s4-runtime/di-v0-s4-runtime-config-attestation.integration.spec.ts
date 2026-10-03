import { Test } from '@nestjs/testing';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DiV0S4RuntimeConfigAttestationService } from './di-v0-s4-runtime-config-attestation.service';
import {
  EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT,
  EXPECTED_DI_V0_S4_RUNTIME_STAGED_FINGERPRINT,
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_NOT_BEFORE,
  DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_ORG_ALLOWLIST,
  DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_VEHICLE_ALLOWLIST,
} from './di-v0-s4-runtime-config-attestation';
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from './di-v0-s4-runtime-config-attestation-metric-parse';

describe('DiV0S4RuntimeConfigAttestationService integration', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  async function scrapeAttestation(): Promise<ReturnType<typeof parseDiV0S4RuntimeConfigAttestationFromPrometheusBody>> {
    const tripMetrics = new TripMetricsService();
    const moduleRef = await Test.createTestingModule({
      providers: [TripMetricsService, DiV0S4RuntimeConfigAttestationService],
    })
      .overrideProvider(TripMetricsService)
      .useValue(tripMetrics)
      .compile();
    await moduleRef.init();
    const body = await tripMetrics.registry.metrics();
    return parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(String(body));
  }

  it('PRESTATE boot exposes PRESTATE fingerprint', async () => {
    for (const key of [
      'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE',
      DI_V0_S4_ENV_ALLOWLISTS.organization,
      DI_V0_S4_ENV_ALLOWLISTS.vehicle,
      'DI_V0_S4_MASTER_ENABLED',
    ]) {
      delete process.env[key];
    }
    const parsed = await scrapeAttestation();
    expect(parsed.state).toBe('PRESTATE');
    expect(parsed.fingerprint).toBe(EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT);
  });

  it('STAGED boot exposes STAGED fingerprint', async () => {
    process.env.DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE = DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_NOT_BEFORE;
    process.env[DI_V0_S4_ENV_ALLOWLISTS.organization] = DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_ORG_ALLOWLIST;
    process.env[DI_V0_S4_ENV_ALLOWLISTS.vehicle] = DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_VEHICLE_ALLOWLIST;
    const parsed = await scrapeAttestation();
    expect(parsed.state).toBe('STAGED');
    expect(parsed.fingerprint).toBe(EXPECTED_DI_V0_S4_RUNTIME_STAGED_FINGERPRINT);
  });

  it('OTHER boot exposes OTHER state', async () => {
    process.env.DI_V0_S4_MASTER_ENABLED = 'true';
    const parsed = await scrapeAttestation();
    expect(parsed.state).toBe('OTHER');
  });
});
