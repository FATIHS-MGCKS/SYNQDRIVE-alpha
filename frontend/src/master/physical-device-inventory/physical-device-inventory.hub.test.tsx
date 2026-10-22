// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { PhysicalDeviceInventoryHub } from './PhysicalDeviceInventoryHub';
import {
  physicalDeviceListFixture,
  physicalDeviceSummaryFixture,
} from '../../lib/physical-device-inventory.fixtures';

const { summaryMock, listDevicesMock } = vi.hoisted(() => ({
  summaryMock: vi.fn(async () => physicalDeviceSummaryFixture),
  listDevicesMock: vi.fn(async () => physicalDeviceListFixture),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      physicalDeviceInventory: {
        summary: summaryMock,
        listDevices: listDevicesMock,
        manualIntake: vi.fn(),
        identityMonitoringLiveSnapshot: vi.fn(async () => ({
          evaluatedAt: '2026-10-22T10:00:00.000Z',
          evaluationScope: 'RUPTELA_R1_ACTIVE_INSTALL',
          lastSuccessfulDimoVehicleSyncAt: '2026-10-22T09:46:12.000Z',
          inventoryRegisteredCount: 3,
          inventoryInstalledCount: 3,
          summary: { matchCount: 3, driftCount: 0, unconfirmedCount: 0 },
          devices: [],
          note: 'test',
        })),
      },
    },
  },
}));

describe('PhysicalDeviceInventoryHub', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    summaryMock.mockClear();
    listDevicesMock.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('loads inventory list from API and renders masked serial', async () => {
    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(PhysicalDeviceInventoryHub, { organizations: [] }),
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(summaryMock).toHaveBeenCalled();
    expect(listDevicesMock).toHaveBeenCalled();
    expect(container.textContent).toContain('R1-1***0068');
    expect(container.textContent).toContain('PDI-CONTRACT-001');
  });
});
