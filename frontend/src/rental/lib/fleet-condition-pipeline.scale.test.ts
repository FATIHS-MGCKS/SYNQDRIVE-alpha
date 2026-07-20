import { describe, expect, it } from 'vitest';
import { computeFleetHealthKpis } from './fleet-health-control-center';
import {
  countExpandedFleetConditionDomRows,
  filterAndSortFleetConditionVehicles,
  groupFleetConditionVehicles,
  shouldVirtualizeFleetConditionGroup,
  FLEET_CONDITION_VIRTUALIZE_THRESHOLD,
} from './fleet-condition-pipeline';
import {
  buildSyntheticFleetHealthMap,
  buildSyntheticFleetVehicles,
  FLEET_HEALTH_SCALE_TIERS,
} from '../components/fleet-health-service/fleet-health-scale.fixtures';

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

const PIPELINE_MS_LIMIT: Record<number, number> = {
  100: 80,
  500: 250,
  1000: 500,
  5000: 2_000,
};

describe('fleet-condition-pipeline scale coverage', () => {
  it.each(FLEET_HEALTH_SCALE_TIERS)(
    'filter+group pipeline completes within budget for %i vehicles',
    (count) => {
      const vehicles = buildSyntheticFleetVehicles(count);
      const healthMap = buildSyntheticFleetHealthMap(count);

      const elapsed = timeMs(() => {
        const filtered = filterAndSortFleetConditionVehicles({
          fleetVehicles: vehicles,
          healthMap,
          statusFilter: 'all',
          moduleFilter: 'all',
          dataQualityFilter: 'all',
          searchQuery: '',
          sortMode: 'priority',
        });
        groupFleetConditionVehicles(filtered, healthMap);
      });

      expect(elapsed).toBeLessThan(PIPELINE_MS_LIMIT[count]!);
    },
  );

  it.each(FLEET_HEALTH_SCALE_TIERS)(
    'KPI aggregation stays within budget for %i vehicles',
    (count) => {
      const vehicles = buildSyntheticFleetVehicles(count);
      const healthMap = buildSyntheticFleetHealthMap(count);
      const ids = vehicles.map((v) => v.id);

      const elapsed = timeMs(() => computeFleetHealthKpis(ids, healthMap));
      expect(elapsed).toBeLessThan(PIPELINE_MS_LIMIT[count]! / 2);
      expect(computeFleetHealthKpis(ids, healthMap).total).toBe(count);
    },
  );

  it('search filter reduces candidate set without scanning URL params', () => {
    const vehicles = buildSyntheticFleetVehicles(500);
    const healthMap = buildSyntheticFleetHealthMap(500);
    const filtered = filterAndSortFleetConditionVehicles({
      fleetVehicles: vehicles,
      healthMap,
      statusFilter: 'all',
      moduleFilter: 'all',
      dataQualityFilter: 'all',
      searchQuery: 'M-SD 42',
      sortMode: 'license',
    });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(500);
  });

  it('virtualization threshold keeps expanded DOM rows bounded', () => {
    const vehicles = buildSyntheticFleetVehicles(500);
    const healthMap = buildSyntheticFleetHealthMap(500);
    const grouped = groupFleetConditionVehicles(vehicles, healthMap);
    const expanded = new Set<keyof typeof grouped>(['action_required']);

    const domRows = countExpandedFleetConditionDomRows({ grouped, expandedGroups: expanded });
    expect(domRows).toBeGreaterThan(FLEET_CONDITION_VIRTUALIZE_THRESHOLD);
    expect(shouldVirtualizeFleetConditionGroup(domRows)).toBe(true);
    expect(shouldVirtualizeFleetConditionGroup(25)).toBe(false);
  });
});
