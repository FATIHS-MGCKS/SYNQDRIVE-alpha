import {
  DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
  DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
  DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG,
  renderDimoDetectorConfigArg,
} from './dimo-energy-detector.config';
import { buildEnergyEventSegmentsQuery } from '../queries/energy-event-segments.query';
import { buildDimoRechargeSegmentsQuery } from '../recharge-segments/dimo-recharge-segments.query';
import { validateDimoSegmentsQuery } from '../queries/validate-dimo-segments-query';
import {
  KS_MX_2024_REFUEL_WINDOW,
  KS_MX_2024_TOKEN_ID,
  KS_MX_2024_TUNED_CONFIG_SEGMENT,
} from '../fixtures/ks-mx-2024-refuel.fixture';

describe('dimo-energy-detector.config (E2)', () => {
  it('exposes a version stamp for ops correlation', () => {
    expect(DIMO_ENERGY_DETECTOR_CONFIG_VERSION).toBe('e2-2026-08');
  });

  it('renders refuel minIncreasePercent into GraphQL config arg', () => {
    expect(renderDimoDetectorConfigArg(DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG)).toBe(
      '\n        config: { minIncreasePercent: 5 }',
    );
  });

  it('omits config arg when recharge uses DIMO defaults', () => {
    expect(renderDimoDetectorConfigArg(DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG)).toBe('');
  });

  it('builds schema-valid refuel query with E2 production config', () => {
    const query = buildEnergyEventSegmentsQuery(
      KS_MX_2024_TOKEN_ID,
      new Date(KS_MX_2024_REFUEL_WINDOW.from),
      new Date(KS_MX_2024_REFUEL_WINDOW.to),
      'refuel',
      DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
    );
    const result = validateDimoSegmentsQuery(query);
    expect(result.valid).toBe(true);
    expect(query).toContain('config: { minIncreasePercent: 5 }');
    expect(query).toContain('mechanism: refuel');
  });

  it('builds schema-valid recharge query without config (DIMO default)', () => {
    const query = buildDimoRechargeSegmentsQuery({
      tokenId: 186946,
      fromIso: '2026-06-15T00:00:00.000Z',
      toIso: '2026-07-16T00:00:00.000Z',
      detectorConfig: DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG,
    });
    const result = validateDimoSegmentsQuery(query);
    expect(result.valid).toBe(true);
    expect(query).not.toContain('config:');
  });

  it('KS MX canonical segment timestamps match E2 fixture reference', () => {
    expect(KS_MX_2024_TUNED_CONFIG_SEGMENT.start.timestamp).toBe('2026-08-23T16:15:15.000Z');
    expect(KS_MX_2024_TUNED_CONFIG_SEGMENT.end.timestamp).toBe('2026-08-23T16:23:16.000Z');
    expect(KS_MX_2024_TUNED_CONFIG_SEGMENT.duration).toBe(481);
  });
});
