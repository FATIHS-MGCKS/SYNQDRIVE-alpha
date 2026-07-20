// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiServiceCase } from '../../../lib/api';
import { FleetHealthServiceCaseList } from './FleetHealthServiceCaseList';

vi.mock('../../FleetContext', () => ({
  useFleetVehicles: () => ({
    fleetVehicles: [
      {
        id: 'v1',
        license: 'KS-SD 101',
        make: 'VW',
        model: 'Golf',
        year: 2022,
      },
    ],
  }),
}));

const serviceCase: ApiServiceCase = {
  id: 'sc-1',
  organizationId: 'org-1',
  vehicleId: 'v1',
  vendorId: 'vendor-1',
  title: 'Bremsen prüfen',
  description: '',
  category: 'BRAKES',
  status: 'OPEN',
  priority: 'HIGH',
  source: 'HEALTH',
  openedAt: '2026-07-19T10:00:00.000Z',
  scheduledAt: '2026-07-21T09:00:00.000Z',
  expectedReadyAt: null,
  completedAt: null,
  cancelledAt: null,
  estimatedCostCents: 25000,
  actualCostCents: null,
  downtimeStart: null,
  downtimeEnd: null,
  blocksRental: true,
  completionNotes: null,
  documentId: null,
  metadata: null,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: '2026-07-19T10:00:00.000Z',
  updatedAt: '2026-07-20T08:00:00.000Z',
  taskCount: 1,
  tasks: [],
};

describe('FleetHealthServiceCaseList', () => {
  it('renders filter bar and desktop table with resolved vehicle labels', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServiceCaseList
        serviceCases={[serviceCase]}
        vendors={[{ id: 'vendor-1', name: 'Werkstatt Nord' } as never]}
        dataReady
      />,
    );

    expect(html).toContain('Offen');
    expect(html).toContain('KS-SD 101');
    expect(html).toContain('VW Golf 2022');
    expect(html).toContain('Bremsen prüfen');
    expect(html).toContain('Werkstatt Nord');
    expect(html).toContain('Mietblockade');
    expect(html).not.toContain('vehicleId');
    expect(html).not.toContain('>v1<');
  });

  it('renders error state without list content', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServiceCaseList
        serviceCases={[]}
        vendors={[]}
        dataReady={false}
        error="Servicefälle konnten nicht geladen werden."
      />,
    );

    expect(html).toContain('Servicefälle konnten nicht geladen werden.');
    expect(html).not.toContain('Bremsen prüfen');
  });

  it('renders loading empty copy for mobile cards', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServiceCaseList
        serviceCases={[]}
        vendors={[]}
        dataReady
        loading
      />,
    );

    expect(html).toContain('Servicefälle werden geladen');
  });
});
