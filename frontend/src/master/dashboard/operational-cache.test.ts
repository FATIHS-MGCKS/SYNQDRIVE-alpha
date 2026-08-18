import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetOperationalDashboardForTests,
  __setOperationalDashboardForTests,
  getOperationalDashboardSnapshot,
} from './operational-cache';
import { productionOperationalDashboardFixture } from './master-dashboard-fixtures';

describe('operational-cache snapshot stability', () => {
  afterEach(() => {
    __resetOperationalDashboardForTests();
  });

  it('returns the same snapshot reference until the store updates', () => {
    const first = getOperationalDashboardSnapshot();
    const second = getOperationalDashboardSnapshot();
    expect(first).toBe(second);
  });

  it('updates snapshot reference only when data is committed', () => {
    const empty = getOperationalDashboardSnapshot();
    __setOperationalDashboardForTests(productionOperationalDashboardFixture());
    const loaded = getOperationalDashboardSnapshot();
    expect(loaded).not.toBe(empty);
    expect(loaded.data?.overallStatus).toBe('warning');
    expect(loaded.revision).toBeGreaterThan(empty.revision);
  });
});
