import { describe, expect, it } from 'vitest';
import type { ApiServiceCaseListItem } from '../../api';
import {
  mergeServiceCaseListPages,
  replaceServiceCaseListFirstPage,
} from './serviceCaseListPagination.utils';

function row(id: string): ApiServiceCaseListItem {
  return {
    id,
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vendorId: null,
    title: `Case ${id}`,
    description: '',
    category: 'SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    openedAt: '2026-07-01T00:00:00.000Z',
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
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    taskCount: 0,
  };
}

describe('serviceCaseListPagination.utils', () => {
  it('replaces the first page on reload', () => {
    expect(replaceServiceCaseListFirstPage([row('old')], [row('new-1'), row('new-2')])).toEqual([
      row('new-1'),
      row('new-2'),
    ]);
  });

  it('appends later pages without duplicates', () => {
    const merged = mergeServiceCaseListPages([row('a'), row('b')], [row('b'), row('c')]);
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});
