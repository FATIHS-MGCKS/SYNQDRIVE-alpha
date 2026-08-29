import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/translations/en';
import { de } from '../../i18n/translations/de';
import { fr } from '../../i18n/translations/fr';
import { nl } from '../../i18n/translations/nl';
import { es } from '../../i18n/translations/es';
import { it as itLocale } from '../../i18n/translations/it';
import { pl } from '../../i18n/translations/pl';
import { cs } from '../../i18n/translations/cs';
import type { Locale } from '../../i18n/LanguageContext';
import { TRIPS_ROUTE_I18N_KEYS } from './trips-route-i18n';
import {
  buildMeasuredSpeedLineFeatures,
  deriveTripMapQuality,
} from './trips-map.utils';
import {
  continuityStatusLabel,
  processingStateLabel,
  routeQualityLabel,
} from './trips-route-i18n';

const locales: Record<Locale, Record<string, string>> = {
  en,
  de,
  fr,
  nl,
  es,
  it: itLocale,
  pl,
  cs,
};

const tEn = (key: keyof typeof en) => en[key];

describe('trips route i18n', () => {
  it('defines every visible route overlay key in all supported locales', () => {
    for (const locale of Object.keys(locales) as Locale[]) {
      for (const key of TRIPS_ROUTE_I18N_KEYS) {
        expect(locales[locale][key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  it('labels route quality via canonical translation keys', () => {
    expect(routeQualityLabel(tEn, 'MATCHED')).toBe('Road matched');
    expect(routeQualityLabel(tEn, 'FILTERED')).toBe('GPS cleaned');
    expect(routeQualityLabel(tEn, 'RAW')).toBe('Raw telemetry');
  });
});

describe('trips-map canonical route quality', () => {
  it('keeps quality, continuity, and processing separate', () => {
    const quality = deriveTripMapQuality(
      {
        id: 'trip-1',
        vehicleId: 'veh-1',
        tripStatus: 'COMPLETED',
        startTime: '2026-08-29T10:00:00.000Z',
      },
      {
        routeQuality: 'MATCHED',
        matchConfidence: 0.92,
        matchCoverage: 0.88,
        continuityStatus: 'GAPS_PRESENT',
        processingState: 'READY',
        routeProcessedAt: '2026-08-29T12:00:00.000Z',
        segmentCount: 2,
        routeError: null,
        behaviorLoading: false,
      },
    );

    expect(quality.routeQuality).toBe('MATCHED');
    expect(quality.continuityStatus).toBe('GAPS_PRESENT');
    expect(quality.processingState).toBe('READY');
    expect(quality.routeIncomplete).toBe(true);
  });

  it('shows processing state while route artifact is pending', () => {
    const quality = deriveTripMapQuality(null, {
      routeQuality: null,
      matchConfidence: null,
      matchCoverage: null,
      continuityStatus: 'INSUFFICIENT_DATA',
      processingState: 'PROCESSING',
      routeProcessedAt: null,
      segmentCount: 0,
      routeError: null,
      behaviorLoading: false,
    });

    expect(quality.routeAvailable).toBe(false);
    expect(processingStateLabel(tEn, 'PROCESSING')).toBe('Processing route…');
    expect(continuityStatusLabel(tEn, 'INSUFFICIENT_DATA')).toBe('Route incomplete');
  });
});

describe('buildMeasuredSpeedLineFeatures', () => {
  const points = [
    { latitude: 52.5, longitude: 13.4, speedKmh: 40, timestamp: '2026-08-29T10:00:00.000Z' },
    { latitude: 52.51, longitude: 13.41, speedKmh: 42, timestamp: '2026-08-29T10:01:00.000Z' },
    { latitude: 52.52, longitude: 13.42, speedKmh: 44, timestamp: '2026-08-29T10:06:00.000Z' },
    { latitude: 52.53, longitude: 13.43, speedKmh: 46, timestamp: '2026-08-29T10:07:00.000Z' },
  ];

  it('does not draw speed segments across known UNKNOWN gaps', () => {
    const features = buildMeasuredSpeedLineFeatures(points, true, 180);
    expect(features).toHaveLength(2);
    expect(features[0].geometry.coordinates[1]).toEqual([13.41, 52.51]);
    expect(features[1].geometry.coordinates[0]).toEqual([13.42, 52.52]);
  });

  it('keeps continuous speed lines when gaps are not flagged', () => {
    const features = buildMeasuredSpeedLineFeatures(points, false, 180);
    expect(features).toHaveLength(3);
  });
});
