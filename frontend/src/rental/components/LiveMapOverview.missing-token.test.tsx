// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.hoisted(() => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '');
});

vi.mock('mapbox-gl', () => ({
  default: {
    Map: class {},
    Marker: class {},
    NavigationControl: class {},
    AttributionControl: class {},
    accessToken: '',
  },
}));

vi.mock('../../lib/useAddress', () => ({
  useAddress: () => ({ address: { formatted: '—' } }),
}));

import { LiveMapOverview } from './LiveMapOverview';

describe('LiveMapOverview missing token', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows neutral overlay without exposing configuration details', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveMapOverview
          targetPosition={[9.48, 51.31]}
          heading={0}
          speedKmh={0}
          licensePlate="M-AB 1234"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/nicht verfügbar/i);
    expect(container.textContent).not.toMatch(/VITE_|accessToken/i);

    act(() => {
      root.unmount();
      container.remove();
    });
  });
});
