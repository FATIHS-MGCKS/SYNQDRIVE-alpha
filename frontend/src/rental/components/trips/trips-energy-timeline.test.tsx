import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { TripTimelineEnergyCard } from './trip-timeline-shared';
import type { EnergyEvent } from '../../../lib/api';
import {
  formatRechargeDurationMinutes,
  formatRefuelSignalChangeMinutes,
  TRIPS_ENERGY_I18N_KEYS,
} from './trips-energy-i18n';
import { en } from '../../i18n/translations/en';
import { de } from '../../i18n/translations/de';
import { fr } from '../../i18n/translations/fr';
import { nl } from '../../i18n/translations/nl';
import { es } from '../../i18n/translations/es';
import { it as itLocale } from '../../i18n/translations/it';
import { pl } from '../../i18n/translations/pl';
import { cs } from '../../i18n/translations/cs';
import type { Locale } from '../../i18n/LanguageContext';

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

function baseEvent(overrides: Partial<EnergyEvent> = {}): EnergyEvent {
  return {
    id: 'evt-1',
    vehicleId: 'veh-1',
    dimoSegmentId: 'dimo-refuel-187336-1787950855000',
    kind: 'REFUEL',
    detectionMechanism: 'refuel',
    startTime: '2026-08-28T21:00:55.000Z',
    endTime: '2026-08-28T22:21:13.000Z',
    durationSeconds: 4818,
    startLatitude: 51.32,
    startLongitude: 9.53,
    endLatitude: 51.33,
    endLongitude: 9.5,
    fuelDeltaLiters: 23,
    fuelDeltaPercent: 34.5,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 187585,
    odometerEndKm: 187592,
    confidence: 'HIGH',
    fuelLevelRiseStart: '2026-08-28T22:10:00.000Z',
    fuelLevelRiseEnd: '2026-08-28T22:14:40.000Z',
    fuelLevelRiseDurationSeconds: 280,
    ...overrides,
  };
}

describe('trips energy timeline semantics', () => {
  it('defines energy i18n keys in all supported locales', () => {
    for (const locale of Object.keys(locales) as Locale[]) {
      for (const key of TRIPS_ENERGY_I18N_KEYS) {
        expect(locales[locale][key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  it('does not render envelope duration as implicit refuel minutes', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <TripTimelineEnergyCard event={baseEvent()} isDark={false} />
      </LanguageProvider>,
    );
    expect(html).not.toMatch(/\b80\s*min\b/i);
    expect(html).toContain('Fuel level rise ~5 min');
    expect(html).toContain('Detection window');
    expect(html).toContain('+23.0 L');
  });

  it('omits fabricated refuel duration when fuel rise is unavailable', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <TripTimelineEnergyCard
          event={baseEvent({
            fuelLevelRiseStart: null,
            fuelLevelRiseEnd: null,
            fuelLevelRiseDurationSeconds: null,
          })}
          isDark={false}
        />
      </LanguageProvider>,
    );
    expect(html).not.toMatch(/\b80\s*min\b/i);
    expect(html).not.toContain('Fuel level rise');
    expect(html).toContain('Refuel detected');
  });

  it('keeps recharge duration presentation unchanged', () => {
    const recharge = baseEvent({
      kind: 'RECHARGE',
      detectionMechanism: 'recharge',
      durationSeconds: 3600,
      fuelDeltaLiters: null,
      fuelDeltaPercent: null,
      socDeltaPercent: 42,
      energyDeltaKwh: 18,
      fuelLevelRiseDurationSeconds: null,
    });
    expect(formatRechargeDurationMinutes(recharge.durationSeconds)).toBe(60);
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <TripTimelineEnergyCard event={recharge} isDark={false} />
      </LanguageProvider>,
    );
    expect(html).toContain('60 min');
    expect(html).not.toContain('Fuel level rise');
  });

  it('formats KS MX fuel-rise minutes from observation field', () => {
    expect(formatRefuelSignalChangeMinutes(280)).toBe(5);
    expect(formatRefuelSignalChangeMinutes(4818)).toBe(80);
  });
});
