import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGACY_VOICE_VIEW, LEGACY_WHATSAPP_VIEW } from '../components/communication-center/legacy-communication-navigation';
import {
  RENTAL_CURRENT_VIEW_IDS,
  isRentalCurrentView,
  rentalCurrentViewFromLegacyResolution,
} from './rental-current-view';

const here = dirname(fileURLToPath(import.meta.url));

describe('rental-current-view', () => {
  it('excludes legacy communication view ids from active union', () => {
    expect(RENTAL_CURRENT_VIEW_IDS).not.toContain(LEGACY_WHATSAPP_VIEW);
    expect(RENTAL_CURRENT_VIEW_IDS).not.toContain(LEGACY_VOICE_VIEW);
    expect(isRentalCurrentView('communication-center')).toBe(true);
    expect(isRentalCurrentView(LEGACY_WHATSAPP_VIEW)).toBe(false);
  });

  it('maps legacy resolver output to communication-center', () => {
    expect(
      rentalCurrentViewFromLegacyResolution({
        view: 'communication-center',
        routeFamily: 'whatsapp',
        destinationClass: 'communication_channels_whatsapp',
        legacyView: LEGACY_WHATSAPP_VIEW,
      }),
    ).toBe('communication-center');
  });

  it('App.tsx currentView state does not list legacy view ids', () => {
    const appSource = readFileSync(resolve(here, '../App.tsx'), 'utf8');
    expect(appSource).toContain('useState<RentalCurrentView>');
    expect(appSource).not.toMatch(/useState<[^>]*whatsapp-business/);
    expect(appSource).not.toMatch(/useState<[^>]*ai-voice-assistant/);
  });
});