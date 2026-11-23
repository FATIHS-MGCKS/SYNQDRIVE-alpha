// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OperatorDeepLinkBridge } from './OperatorDeepLinkBridge';

const setActiveTab = vi.fn();
const setSelectedVehicleId = vi.fn();
const setFocusedBookingId = vi.fn();
const setScanQuery = vi.fn();

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    setActiveTab,
    setSelectedVehicleId,
    setFocusedBookingId,
    setScanQuery,
  }),
}));

const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';

function renderBridge(initialPath: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialPath] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/operator', element: createElement(OperatorDeepLinkBridge) }),
          createElement(Route, {
            path: '/operator/vehicles/:vehicleId',
            element: createElement(OperatorDeepLinkBridge),
          }),
          createElement(Route, { path: '/operator/scan', element: createElement(OperatorDeepLinkBridge) }),
        ),
      ),
    );
  });
  return { container, root };
}

describe('OperatorDeepLinkBridge', () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('activates scan tab and vehicle focus for vehicle path', () => {
    renderBridge(`/operator/vehicles/${VEHICLE_ID}`);
    expect(setActiveTab).toHaveBeenCalledWith('scan');
    expect(setSelectedVehicleId).toHaveBeenCalledWith(VEHICLE_ID);
    expect(setFocusedBookingId).toHaveBeenCalledWith(null);
  });

  it('activates scan tab for /operator/scan path', () => {
    renderBridge('/operator/scan');
    expect(setActiveTab).toHaveBeenCalledWith('scan');
  });

  it('clears vehicle and booking focus when returning to bare /operator', () => {
    renderBridge(`/operator/vehicles/${VEHICLE_ID}`);
    vi.clearAllMocks();
    renderBridge('/operator');
    expect(setSelectedVehicleId).toHaveBeenCalledWith(null);
    expect(setFocusedBookingId).toHaveBeenCalledWith(null);
  });

  it('clears stale path focus when tab query selects tasks', () => {
    renderBridge('/operator?tab=tasks');
    expect(setActiveTab).toHaveBeenCalledWith('tasks');
    expect(setSelectedVehicleId).toHaveBeenCalledWith(null);
    expect(setFocusedBookingId).toHaveBeenCalledWith(null);
  });
});