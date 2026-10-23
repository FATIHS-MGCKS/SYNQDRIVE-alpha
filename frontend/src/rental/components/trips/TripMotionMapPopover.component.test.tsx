import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { TripMotionMapPopover } from './TripMotionMapPopover';
import type { TripMotionMapEvent } from './motion-map.types';
import { tripsMotionMapDE } from '../../../i18n/translations/trips-motion-map.de';
import { tripsMotionMapEN } from '../../../i18n/translations/trips-motion-map.en';
import { tripsMotionMapPL } from '../../../i18n/translations/trips-motion-map.pl';
import { tripsMotionMapFR } from '../../../i18n/translations/trips-motion-map.fr';
import { tripsMotionMapCS } from '../../../i18n/translations/trips-motion-map.cs';
import { tripsMotionMapNL } from '../../../i18n/translations/trips-motion-map.nl';
import { tripsMotionMapES } from '../../../i18n/translations/trips-motion-map.es';
import { tripsMotionMapTR } from '../../../i18n/translations/trips-motion-map.tr';
import { tripsMotionMapIT } from '../../../i18n/translations/trips-motion-map.it';

/** Pinned Tiguan WOB L 7503 braking event 19:04:26–19:04:29 UTC (IMG_7778 case). */
const tiguanDecel: TripMotionMapEvent = {
  id: 'motion-ev-17-2026-10-22T19:04:26Z',
  kind: 'DECELERATION',
  displayKind: 'DECELERATION',
  startLabelUtc: '2026-10-22T19:04:26Z',
  endLabelUtc: '2026-10-22T19:04:29Z',
  startSpeedKmh: 34.7,
  endSpeedKmh: 5.5,
  deltaKmh: 29.2,
  peakAccel1sMps2: null,
  quality: 'DEGRADED',
  artefactSuspect: false,
  latitude: 51.3284,
  longitude: 9.52193,
  positionResolved: true,
};

function wrap(ui: ReactNode) {
  return renderToStaticMarkup(<LanguageProvider>{ui}</LanguageProvider>);
}

// Popover clamps its anchor to the viewport; provide a minimal window in the node environment.
const globalWithWindow = globalThis as unknown as { window?: { innerWidth: number } };
let hadWindow = false;
beforeAll(() => {
  hadWindow = typeof globalWithWindow.window !== 'undefined';
  if (!hadWindow) globalWithWindow.window = { innerWidth: 1280 };
});
afterAll(() => {
  if (!hadWindow) delete globalWithWindow.window;
});

describe('TripMotionMapPopover event body', () => {
  it('renders signed Δv, duration, mean acceleration and quality for a braking event', () => {
    const html = wrap(
      <TripMotionMapPopover
        state={{ kind: 'event', event: tiguanDecel, segment: { sampleCount: 4, extended: false }, x: 200, y: 200 }}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain('35 → 6 km/h (−29)');
    expect(html).not.toContain('(+29)');
    expect(html).toContain('3 s');
    expect(html).toContain('−2.7 m/s²');
    expect(html).toContain('Braking');
    expect(html).toContain('Quality: uncertain');
    expect(html).not.toContain('No route segment');
    expect(html).not.toContain('approximated');
  });

  it('explains missing or approximated route segments', () => {
    const none = wrap(
      <TripMotionMapPopover
        state={{ kind: 'event', event: tiguanDecel, segment: { sampleCount: 0, extended: false }, x: 200, y: 200 }}
        onClose={() => undefined}
      />,
    );
    expect(none).toContain('No route segment available for this time window');
    const approx = wrap(
      <TripMotionMapPopover
        state={{ kind: 'event', event: tiguanDecel, segment: { sampleCount: 2, extended: true }, x: 200, y: 200 }}
        onClose={() => undefined}
      />,
    );
    expect(approx).toContain('Route segment approximated');
  });
});

describe('trips.motionMap event detail keys exist in all 9 locales', () => {
  const dictionaries = {
    de: tripsMotionMapDE,
    en: tripsMotionMapEN,
    pl: tripsMotionMapPL,
    fr: tripsMotionMapFR,
    cs: tripsMotionMapCS,
    nl: tripsMotionMapNL,
    es: tripsMotionMapES,
    tr: tripsMotionMapTR,
    it: tripsMotionMapIT,
  } as const;
  const keys = [
    'trips.motionMap.eventWindow',
    'trips.motionMap.eventDuration',
    'trips.motionMap.eventMeanAccel',
    'trips.motionMap.eventQuality',
    'trips.motionMap.qualityOk',
    'trips.motionMap.qualityLimited',
    'trips.motionMap.qualityDegraded',
    'trips.motionMap.segmentUnavailable',
    'trips.motionMap.segmentApproximate',
    'trips.motionMap.summaryEvents',
  ] as const;

  it('has every key with a non-empty value and identical key sets', () => {
    const enKeys = Object.keys(dictionaries.en).sort();
    for (const [locale, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict).sort(), `key set ${locale}`).toEqual(enKeys);
      for (const key of keys) {
        const value = (dict as Record<string, string>)[key];
        expect(typeof value, `${locale}:${key}`).toBe('string');
        expect(value.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('does not share English copy for non-English locales on the new quality labels', () => {
    for (const [locale, dict] of Object.entries(dictionaries)) {
      if (locale === 'en') continue;
      expect((dict as Record<string, string>)['trips.motionMap.qualityDegraded']).not.toBe(
        tripsMotionMapEN['trips.motionMap.qualityDegraded'],
      );
    }
  });
});
