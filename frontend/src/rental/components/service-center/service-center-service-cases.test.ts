import { describe, expect, it, vi } from 'vitest';
import type { ApiServiceCase } from '../../../lib/api';
import {
  fetchServiceCenterServiceCases,
  hasServiceCenterServiceCases,
} from './service-center-service-cases';

vi.mock('../../../lib/api', () => ({
  api: {
    serviceCases: {
      list: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';

const serviceCase: ApiServiceCase = {
  id: 'sc-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  vendorId: 'vendor-1',
  title: 'Bremsen Service',
  description: 'Vorderachse prüfen',
  category: 'REPAIR',
  status: 'OPEN',
  priority: 'NORMAL',
  source: 'MANUAL',
  openedAt: '2026-07-20T10:00:00.000Z',
  scheduledAt: null,
  expectedReadyAt: null,
  completedAt: null,
  cancelledAt: null,
  estimatedCostCents: null,
  actualCostCents: null,
  downtimeStart: null,
  downtimeEnd: null,
  blocksRental: false,
  completionNotes: null,
  documentId: null,
  metadata: null,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
  taskCount: 1,
  tasks: [{ id: 't1', title: 'Bremsen', status: 'OPEN', type: 'VEHICLE_SERVICE', dueDate: null }],
};

describe('service-center-service-cases', () => {
  it('fetchServiceCenterServiceCases calls org-scoped list endpoint', async () => {
    vi.mocked(api.serviceCases.list).mockResolvedValue([serviceCase]);

    const result = await fetchServiceCenterServiceCases('org-1');

    expect(api.serviceCases.list).toHaveBeenCalledWith('org-1');
    expect(result).toEqual([serviceCase]);
  });

  it('fetchServiceCenterServiceCases rejects non-array responses', async () => {
    vi.mocked(api.serviceCases.list).mockResolvedValue({ items: [] } as never);

    await expect(fetchServiceCenterServiceCases('org-1')).rejects.toThrow(
      'Invalid service cases list response',
    );
  });

  it('hasServiceCenterServiceCases distinguishes empty from populated lists', () => {
    expect(hasServiceCenterServiceCases([])).toBe(false);
    expect(hasServiceCenterServiceCases([serviceCase])).toBe(true);
  });
});
