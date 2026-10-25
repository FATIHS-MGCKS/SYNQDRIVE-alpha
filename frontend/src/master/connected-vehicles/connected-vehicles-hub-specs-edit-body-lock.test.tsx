// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehiclesHub } from './ConnectedVehiclesHub';
import { minimalOperationalDetailFixture } from './test-fixtures/operational-detail.fixture';

const vehiclesGetMock = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() },
}));

vi.mock('./useVehicleOffboard', () => ({
  useVehicleOffboard: () => ({
    execute: vi.fn(),
    state: { phase: 'idle' },
    clear: vi.fn(),
    abandonPending: vi.fn(),
    retryAfterMfa: vi.fn(),
    retryUncertain: vi.fn(),
    isSubmitting: false,
  }),
}));

vi.mock('./useConnectedVehiclesOperational', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useConnectedVehiclesOperational')>();
  return {
    ...actual,
    useConnectedVehiclesList: () => ({
      query: { registryLifecycle: 'ACTIVE' },
      data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } },
      loading: false,
      error: null,
      setQuery: vi.fn(),
      refresh: vi.fn(),
    }),
    useConnectedVehiclesOverview: () => ({
      overview: { counts: { registered: 1 } },
      loading: false,
      error: null,
      refresh: vi.fn(),
    }),
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
  };
});

vi.mock('./vo5c-release-gates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vo5c-release-gates')>();
  return { ...actual, isMasterOffboardUiEnabled: () => false };
});

vi.mock('../../context/AppThemeContext', () => ({
  useAppTheme: () => ({
    isDarkMode: false,
    preference: 'light' as const,
    setThemePreference: vi.fn(),
    cycleThemePreference: vi.fn(),
  }),
}));

vi.mock('../components/ExteriorImagesEditor', () => ({
  ExteriorImagesEditor: () => createElement('div', { 'data-testid': 'exterior-images-stub' }),
  flushBufferedExteriorImages: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      get: (...args: unknown[]) => vehiclesGetMock(...args),
      motionPhysicsReference: {
        getActive: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        confirm: vi.fn(),
      },
    },
    dimo: { nonRegistered: vi.fn().mockResolvedValue([]) },
    highMobility: {
      checkAvailability: vi.fn().mockResolvedValue({ isLinked: false }),
      activateHealth: vi.fn(),
    },
  },
  streamAiSpecs: vi.fn(() => ({ abort: vi.fn() })),
  streamAiTireSpecs: vi.fn(),
}));

vi.mock('./ConnectedVehicleDetailDrawer', () => ({
  ConnectedVehicleDetailDrawer: (props: {
    open: boolean;
    onEditSpecifications?: () => void;
    onDrawerClosed?: () => void;
  }) => {
    useEffect(() => {
      if (!props.open) {
        props.onDrawerClosed?.();
      }
    }, [props.open, props.onDrawerClosed]);

    if (!props.open) return null;

    return createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'mock-edit-specs',
        onClick: () => props.onEditSpecifications?.(),
      },
      'Edit specs',
    );
  },
}));

describe('ConnectedVehiclesHub specs edit body scroll lock (Phase A.2)', () => {
  beforeEach(() => {
    vehiclesGetMock.mockReset();
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
    document.body.removeAttribute('data-scroll-locked');
    window.history.pushState({}, '', '?cvSection=vehicles&vehicleId=veh-1');
  });

  it('drawer → editor applies and releases only the modal overflow lock', async () => {
    vehiclesGetMock.mockResolvedValue({
      id: 'veh-1',
      organizationId: 'org-1',
      vin: '5YJ3E1EA1KF123456',
      make: 'Tesla',
      model: 'Model 3',
      year: 2022,
      licensePlate: 'B-EV 1',
      vehicleType: 'SEDAN',
      fuelType: 'Electric',
      mileage: 1000,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(ConnectedVehiclesHub, { organizations: [] }),
        }),
      );
    });

    await act(async () => {
      document
        .querySelector('[data-testid="mock-edit-specs"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.querySelector('[data-testid="vehicle-registration-modal-panel"]')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    const cancelBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    );
    expect(cancelBtn).toBeTruthy();

    await act(async () => {
      cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.querySelector('[data-testid="vehicle-registration-modal-panel"]')).toBeNull();
    expect(document.body.style.overflow).toBe('');

    root.unmount();
    container.remove();
  });

  it('closing the editor leaves an independent Radix dialog lock intact', async () => {
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    document.body.setAttribute('data-scroll-locked', '');

    vehiclesGetMock.mockResolvedValue({
      id: 'veh-1',
      organizationId: 'org-1',
      vin: '5YJ3E1EA1KF123456',
      make: 'Tesla',
      model: 'Model 3',
      year: 2022,
      licensePlate: 'B-EV 1',
      vehicleType: 'SEDAN',
      fuelType: 'Electric',
      mileage: 1000,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(ConnectedVehiclesHub, { organizations: [] }),
        }),
      );
    });

    await act(async () => {
      document
        .querySelector('[data-testid="mock-edit-specs"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const cancelBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    );

    await act(async () => {
      cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.getAttribute('data-scroll-locked')).toBe('');
    expect(document.body.style.pointerEvents).toBe('none');
    expect(document.body.style.overflow).toBe('hidden');

    root.unmount();
    container.remove();
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
    document.body.removeAttribute('data-scroll-locked');
  });
});
