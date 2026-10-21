// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehiclesListView } from './ConnectedVehiclesListView';
import { ConnectedVehicleDetailDrawer } from './ConnectedVehicleDetailDrawer';
import { api } from '../../lib/api';
import type { VehicleOperationalRowDto } from './types';

const VEHICLE_ID = 'veh-offboarded-42';

const activeRow: VehicleOperationalRowDto = {
  vehicleId: 'veh-active-1',
  dimoVehicleId: null,
  vin: 'VIN-ACTIVE',
  licensePlate: null,
  make: 'Make',
  model: 'Model',
  year: 2024,
  organizationId: 'org-1',
  organizationName: 'Org',
  displayTitle: 'Active Van',
  displaySubtitle: 'VIN-ACTIVE',
  registrationState: 'registered',
  registryLifecycle: 'ACTIVE',
  ownership: 'assigned',
  dimoLinkStatus: 'linked',
  integrationConnectivity: 'connected',
  integrationConnectivityLabel: 'Connected',
  telemetryFreshness: 'live',
  telemetryLabel: 'Live',
  attention: { severity: 'none', primaryReason: null, reasonCount: 0 },
  integrity: 'healthy',
  telemetryObservedAtIso: null,
  telemetryComputedAt: '2026-01-01T00:00:00.000Z',
  lastSignalRelative: null,
};

const offboardedRow: VehicleOperationalRowDto = {
  ...activeRow,
  vehicleId: VEHICLE_ID,
  displayTitle: 'Offboarded Sedan',
  displaySubtitle: 'VIN-OFF',
  registryLifecycle: 'OFFBOARDED',
};

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      operationalList: vi.fn(),
      operationalOverview: vi.fn().mockResolvedValue({
        generatedAt: new Date().toISOString(),
        counts: { registered: 2, unregistered: 0, withAttention: 0, dimoLinked: 0 },
        attentionQueue: [],
        platformDimoDegraded: false,
        platformDimoMessage: null,
        freshness: {},
      }),
      operationalDetail: vi.fn(),
    },
  },
}));

describe('Connected Vehicles OFFBOARDED history (VO5C-P2A.3)', () => {
  beforeEach(() => {
    vi.mocked(api.vehicles.operationalList).mockReset();
    window.history.pushState({}, '', '?cvSection=vehicles');
  });

  async function renderList(
    initialFilters?: Record<string, string>,
    onOpenVehicle?: (row: VehicleOperationalRowDto) => void,
  ) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(ConnectedVehiclesListView, {
            onOpenVehicle: onOpenVehicle ?? (() => undefined),
            initialFilters,
          }),
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    return { root, container };
  }

  it('lifecycle filters — ACTIVE excludes offboarded; OFFBOARDED and all locate canonical vehicleId', async () => {
    vi.mocked(api.vehicles.operationalList).mockImplementation(async (query) => {
      const lifecycle = (query as { registryLifecycle?: string }).registryLifecycle ?? 'ACTIVE';
      if (lifecycle === 'ACTIVE') {
        return {
          data: [activeRow],
          meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
        };
      }
      if (lifecycle === 'OFFBOARDED') {
        return {
          data: [offboardedRow],
          meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
        };
      }
      return {
        data: [activeRow, offboardedRow],
        meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
      };
    });

    const opened: VehicleOperationalRowDto[] = [];
    const activeOnly = await renderList(undefined, (row) => opened.push(row));
    expect(document.body.textContent).toContain('Active Van');
    expect(document.body.textContent).not.toContain('Offboarded Sedan');
    activeOnly.root.unmount();
    activeOnly.container.remove();

    const offboardedOnly = await renderList({ cvRegistryLifecycle: 'OFFBOARDED' }, (row) =>
      opened.push(row),
    );
    expect(document.body.textContent).toContain('Offboarded Sedan');
    expect(document.body.textContent).not.toContain('Active Van');

    const rowBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Offboarded Sedan'),
    );
    expect(rowBtn).toBeTruthy();
    await act(async () => {
      rowBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(opened.find((r) => r.vehicleId === VEHICLE_ID)?.vehicleId).toBe(VEHICLE_ID);
    offboardedOnly.root.unmount();
    offboardedOnly.container.remove();

    const allLifecycle = await renderList({ cvRegistryLifecycle: 'all' });
    expect(document.body.textContent).toContain('Active Van');
    expect(document.body.textContent).toContain('Offboarded Sedan');
    allLifecycle.root.unmount();
    allLifecycle.container.remove();
  });

  it('detail drawer — OFFBOARDED badge, audit visible, offboard action hidden', async () => {
    vi.mocked(api.vehicles.operationalDetail).mockResolvedValue({
      ...offboardedRow,
      authorization: { state: 'connected', platformDimoDegraded: false, note: null },
      mapping: {
        dimoVehicleId: null,
        dimoExternalId: null,
        tokenIdMasked: null,
        connectionStatus: null,
        syncedAt: null,
        deviceType: null,
      },
      activeIssues: [],
      pipeline: {
        lastProcessingAt: null,
        lastSuccessfulIngestAt: null,
        stale: false,
        lastPollStatus: null,
        lastPollAt: null,
      },
      auditEvents: [
        {
          id: 'evt-1',
          occurredAt: '2026-01-02T12:00:00.000Z',
          action: 'VEHICLE_OFFBOARDED',
          label: 'Vehicle offboarded',
          actorName: 'Admin',
        },
      ],
      moduleErrors: [],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(ConnectedVehicleDetailDrawer, {
            open: true,
            vehicleId: VEHICLE_ID,
            dimoVehicleId: null,
            onClose: () => undefined,
            offboardUiEnabled: true,
            onOffboard: vi.fn(),
          }),
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toMatch(/Offboarded|Ausgebucht/i);
    expect(document.body.textContent).toContain('Vehicle offboarded');
    const offboardBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /Remove from active fleet|Aus aktivem Bestand entfernen/i.test(b.textContent ?? ''),
    );
    expect(offboardBtn).toBeUndefined();

    root.unmount();
    container.remove();
  });
});
