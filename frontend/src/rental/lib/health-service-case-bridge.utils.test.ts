import { describe, expect, it } from 'vitest';
import type { ApiServiceCase } from '../../lib/api';
import {
  buildHealthServiceCasePrefill,
  buildHealthSourceFindingId,
  defaultHealthFindingCode,
  findDuplicateHealthServiceCase,
} from './health-service-case-bridge.utils';

function caseRow(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: 'sc-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vendorId: null,
    title: 'Testfall',
    description: '',
    category: 'BRAKES',
    status: 'OPEN',
    priority: 'HIGH',
    source: 'HEALTH',
    openedAt: '2026-01-01T00:00:00.000Z',
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
    metadata: {},
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    taskCount: 0,
    tasks: [],
    ...overrides,
  };
}

describe('health-service-case-bridge.utils', () => {
  it('builds stable sourceFindingId from vehicle, module and finding code', () => {
    expect(
      buildHealthSourceFindingId({
        vehicleId: 'veh-1',
        healthModule: 'brakes',
        findingCode: 'rental-brakes',
      }),
    ).toBe('hf:veh-1:brakes:rental-brakes');

    expect(defaultHealthFindingCode('tires')).toBe('rental-tires');
  });

  it('prefills service case with health metadata and blockade context', () => {
    const prefill = buildHealthServiceCasePrefill({
      module: 'brakes',
      vehicleId: 'veh-1',
      rentalModule: { state: 'critical', reason: 'Belag niedrig', last_updated_at: null, data_stale: false },
      findingCode: 'rental-brakes',
      blocksRental: true,
      blockingReasons: ['Bremsen kritisch'],
    });

    expect(prefill.category).toBe('BRAKES');
    expect(prefill.priority).toBe('CRITICAL');
    expect(prefill.source).toBe('HEALTH');
    expect(prefill.blocksRental).toBe(true);
    expect(prefill.metadata.healthModule).toBe('brakes');
    expect(prefill.metadata.findingCode).toBe('rental-brakes');
    expect(prefill.metadata.sourceFindingId).toBe('hf:veh-1:brakes:rental-brakes');
    expect(prefill.description).toContain('Technische Mietblockade aktiv');
    expect(prefill.description).toContain('Bremsen kritisch');
  });

  it('finds duplicate by sourceFindingId on active cases only', () => {
    const sourceFindingId = buildHealthSourceFindingId({
      vehicleId: 'veh-1',
      healthModule: 'battery',
      findingCode: 'rental-battery',
    });

    const open = caseRow({
      id: 'open',
      metadata: { sourceFindingId, healthModule: 'battery', findingCode: 'rental-battery' },
    });
    const completed = caseRow({
      id: 'done',
      status: 'COMPLETED',
      metadata: { sourceFindingId, healthModule: 'battery' },
    });

    expect(
      findDuplicateHealthServiceCase([open, completed], 'veh-1', 'battery', sourceFindingId),
    ).toBe(open);

    expect(
      findDuplicateHealthServiceCase([completed], 'veh-1', 'battery', sourceFindingId),
    ).toBeNull();
  });

  it('falls back to healthModule + findingCode when sourceFindingId missing on case', () => {
    const match = caseRow({
      metadata: { healthModule: 'tires', findingCode: 'rental-tires' },
    });

    expect(
      findDuplicateHealthServiceCase(
        [match],
        'veh-1',
        'tires',
        'hf:veh-1:tires:rental-tires',
        'rental-tires',
      ),
    ).toBe(match);
  });
});
