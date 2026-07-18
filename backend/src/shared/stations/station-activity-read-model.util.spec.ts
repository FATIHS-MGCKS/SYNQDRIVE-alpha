import { describe, expect, it } from '@jest/globals';
import {
  mapStationActivityEntry,
  resolveStationActivityFromTo,
} from './station-activity-read-model.util';

describe('station-activity-read-model.util', () => {
  it('extracts from/to labels from change summary arrow', () => {
    expect(
      resolveStationActivityFromTo({
        changeSummary: 'INACTIVE → ACTIVE',
      }),
    ).toEqual({
      fromLabel: 'INACTIVE',
      toLabel: 'ACTIVE',
    });
  });

  it('extracts from/to labels from meta before/after', () => {
    expect(
      resolveStationActivityFromTo({
        metaJson: {
          before: { status: 'INACTIVE' },
          after: { status: 'ACTIVE' },
        },
      }),
    ).toEqual({
      fromLabel: 'INACTIVE',
      toLabel: 'ACTIVE',
    });
  });

  it('maps actor display name without exposing full email', () => {
    const mapped = mapStationActivityEntry({
      id: 'log-1',
      action: 'UPDATE',
      entity: 'STATION',
      description: 'Updated station',
      changeSummary: null,
      metaJson: null,
      createdAt: new Date('2026-07-18T12:00:00.000Z'),
      user: {
        id: 'user-1',
        name: null,
        email: 'operator@example.com',
      },
    });

    expect(mapped.actor.displayName).toBe('operator');
    expect(mapped.actor.id).toBe('user-1');
  });
});
