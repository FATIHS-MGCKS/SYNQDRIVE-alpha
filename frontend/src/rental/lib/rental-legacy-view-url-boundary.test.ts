// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COMMUNICATION_CENTER_VIEW } from '../components/communication-center/communication-center-navigation';
import {
  LEGACY_WHATSAPP_VIEW,
  redirectLegacyCommunicationRoute,
} from '../components/communication-center/legacy-communication-navigation';
import { rentalCurrentViewFromLegacyResolution } from './rental-current-view';

describe('rental legacy URL boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/rental');
  });

  it('does not redirect when search is empty (unrelated default)', () => {
    window.history.replaceState({}, '', '/rental');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const resolved = redirectLegacyCommunicationRoute(window.location.search, { replace: true });
    expect(resolved).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does not redirect when view param is unrelated', () => {
    window.history.replaceState({}, '', '/rental?view=dashboard');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const resolved = redirectLegacyCommunicationRoute(window.location.search, { replace: true });
    expect(resolved).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('maps legacy whatsapp URL to canonical active view id', () => {
    window.history.replaceState({}, '', `/rental?view=${LEGACY_WHATSAPP_VIEW}&tab=inbox`);
    const resolved = redirectLegacyCommunicationRoute(window.location.search, { replace: true });
    expect(resolved).not.toBeNull();
    expect(rentalCurrentViewFromLegacyResolution(resolved!)).toBe(COMMUNICATION_CENTER_VIEW);
    expect(window.location.search).toContain(`view=${COMMUNICATION_CENTER_VIEW}`);
    expect(window.location.search).not.toContain(LEGACY_WHATSAPP_VIEW);
  });
});