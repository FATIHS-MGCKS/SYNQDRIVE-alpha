// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { TireHealthSummaryResponse } from '../../../lib/api';
import { TireWearV3CustomerPanel } from './TireWearV3CustomerPanel';

vi.mock('../../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: TranslationKey, vars?: Record<string, string | number>) => {
      const template = en[key] ?? key;
      if (!vars) return template;
      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
        template,
      );
    },
  }),
}));

describe('TireWearV3CustomerPanel', () => {
  it('renders nothing without wearV3', () => {
    const html = renderToStaticMarkup(
      <TireWearV3CustomerPanel summary={{} as TireHealthSummaryResponse} />,
    );
    expect(html).toBe('');
  });

  it('renders tread interval when wearV3 present', () => {
    const html = renderToStaticMarkup(
      <TireWearV3CustomerPanel
        summary={
          {
            wearV3: {
            modelVersion: '0.2.0',
            computedAt: '2026-10-27T12:00:00.000Z',
            inputFingerprint: 'fp',
            rated: true,
            setupFlags: [],
            verificationStatus: 'CURRENT',
            verificationQualityFlags: [],
            insufficientEvidence: false,
            lowestTreadPosition: 'FL',
            lowestTreadMm: { lo: 6, hi: 6.2 },
            wheels: [
              {
                position: 'FL',
                treadDepthMm: { lo: 6, hi: 6.2 },
                pointEstimateTreadMm: 6.1,
                treadEvidenceClass: 'MEASURED',
                remainingKm: null,
                replacementThresholdMm: 3,
                evidenceLevel: 'L3',
                uncertaintyFlags: [],
                verificationStatus: 'CURRENT',
                lastAcceptedMeasurementAt: '2026-09-01T00:00:00.000Z',
                kmSinceAcceptedMeasurement: 500,
                nextDueOdometerKm: 15000,
                mountPeriodQualityFlags: [],
              },
            ],
          },
        } as unknown as TireHealthSummaryResponse
        }
      />,
    );
    expect(html).toContain('Tread depth (V3)');
    expect(html).toContain('FL: 6–6.2 mm');
  });
});
