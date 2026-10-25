// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehiclesHub } from './ConnectedVehiclesHub';
import { minimalOperationalDetailFixture } from './test-fixtures/operational-detail.fixture';
const overviewRefresh = vi.fn();
const vehiclesGetMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
  },
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
      refresh: overviewRefresh,
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

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      get: (...args: unknown[]) => vehiclesGetMock(...args),
    },
    dimo: { nonRegistered: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('../components/VehicleRegistrationModal', () => ({
  VehicleRegistrationModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen
      ? createElement(
          'div',
          { 'data-testid': 'registration-modal-open' },
          createElement(
            'button',
            { type: 'button', 'data-testid': 'registration-modal-close', onClick: onClose },
            'close',
          ),
        )
      : null,
}));

vi.mock('./ConnectedVehicleDetailDrawer', () => ({
  ConnectedVehicleDetailDrawer: (props: {
    open: boolean;
    onEditSpecifications?: () => void;
    onDrawerClosed?: () => void;
    editSpecificationsLoading?: boolean;
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
        disabled: props.editSpecificationsLoading,
        onClick: () => props.onEditSpecifications?.(),
      },
      'Edit specs',
    );
  },
}));

describe('ConnectedVehiclesHub specs edit modal lifecycle (Phase A.2 mobile)', () => {
  beforeEach(() => {
    vehiclesGetMock.mockReset();
    window.history.pushState({}, '', '?cvSection=vehicles&vehicleId=veh-1');
  });

  it('loads vehicle, closes drawer, then opens editor after drawer deactivation', async () => {
    const dto = {
      id: 'veh-1',
      organizationId: 'org-1',
      vin: 'VIN123',
      make: 'Tesla',
      model: 'Model 3',
      year: 2022,
    };
    vehiclesGetMock.mockResolvedValue(dto);

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

    expect(document.querySelector('[data-testid="registration-modal-open"]')).toBeNull();

    const editBtn = document.querySelector('[data-testid="mock-edit-specs"]');
    expect(editBtn).toBeTruthy();

    await act(async () => {
      editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(vehiclesGetMock).toHaveBeenCalledWith('veh-1');
    expect(document.querySelector('[data-testid="mock-edit-specs"]')).toBeNull();
    expect(document.querySelector('[data-testid="registration-modal-open"]')).toBeTruthy();

    await act(async () => {
      document
        .querySelector('[data-testid="registration-modal-close"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.querySelector('[data-testid="registration-modal-open"]')).toBeNull();

    root.unmount();
    container.remove();
  });
});
