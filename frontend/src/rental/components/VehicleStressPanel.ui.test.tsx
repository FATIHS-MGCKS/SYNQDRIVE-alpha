import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { en } from '../../i18n/translations/en';
import { VehicleStressPanel } from './VehicleStressPanel';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

function renderPanel(props: ComponentProps<typeof VehicleStressPanel>) {
  return renderToStaticMarkup(<VehicleStressPanel {...props} />);
}

describe('VehicleStressPanel driving impact quality hints', () => {
  it('renders no quality hint for COMPLETE trip_driving_impact (full layout)', () => {
    const html = renderPanel({
      stressScore: 72,
      stressLevel: 'high',
      scoreSource: 'trip_driving_impact',
      drivingImpactAnalysisStatus: 'COMPLETE',
      compact: false,
    });
    expect(html).not.toContain(en['trips.drivingImpact.quality.partial']);
    expect(html).toContain('72');
  });

  it('renders FAILED and legacy hints together (compact layout)', () => {
    const html = renderPanel({
      stressScore: 44,
      stressLevel: 'moderate',
      scoreSource: 'vehicle_trip_compat',
      drivingImpactAnalysisStatus: 'FAILED',
      compact: true,
    });
    expect(html).toContain(en['trips.drivingImpact.quality.failed']);
    expect(html).toContain(en['trips.drivingImpact.quality.legacyCompat']);
  });

  it('renders R1 containment hint when score is withheld (missing layout)', () => {
    const html = renderPanel({
      stressScore: null,
      scoreSource: 'r1_temporal_containment_unavailable',
      hasEnoughData: false,
      compact: false,
    });
    expect(html).toContain(en['trips.drivingImpact.quality.r1Contained']);
  });
});
