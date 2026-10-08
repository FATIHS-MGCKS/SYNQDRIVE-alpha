// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehicleDetailDrawer } from './ConnectedVehicleDetailDrawer';
import { minimalOperationalDetailFixture } from './test-fixtures/operational-detail.fixture';

vi.mock('./useConnectedVehiclesOperational', () => ({
  useConnectedVehicleDetail: () => ({
    detail: minimalOperationalDetailFixture,
    refresh: vi.fn(),
    loading: false,
    error: null,
    diagnostics: null,
    diagnosticsLoading: false,
    diagnosticsError: null,
    loadDiagnostics: vi.fn(),
  }),
}));

describe('offboard release flag UI', () => {
  it('hides offboard action when flag disabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(ConnectedVehicleDetailDrawer, {
            open: true,
            vehicleId: 'veh-1',
            dimoVehicleId: null,
            onClose: () => {},
            offboardUiEnabled: false,
            onOffboard: vi.fn(),
          }),
        }),
      );
    });

    const offboardBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Remove from active fleet'),
    );
    expect(offboardBtn).toBeUndefined();

    root.unmount();
    container.remove();
  });
});
