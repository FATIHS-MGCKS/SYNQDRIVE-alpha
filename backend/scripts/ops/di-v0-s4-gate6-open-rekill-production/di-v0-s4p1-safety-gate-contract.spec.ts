/**
 * EXP021-S4P1 — regression: operational safety is technical/verifiable in Gate-6 code;
 * continuous human supervision is not a coded activation prerequisite.
 */
import { GATE6_ABORT_CONDITIONS, GATE6_MONITORING_QUERIES } from './di-v0-s4-gate6-open-rekill-production.lib';
import { S4_ELIGIBLE_FLEET_VEHICLE_IDS, S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS } from './di-v0-s4-fleet-rollout.lib';

const HUMAN_SUPERVISION_PATTERN =
  /24\s*h(our)?|continuous\s+human|human\s+attendance|named\s+operator|on-?call\s+handoff|staffing/i;

describe('EXP021 S4P1 safety gate contract (Gate-6 lib)', () => {
  it('abort conditions are technical only (no continuous human supervision)', () => {
    for (const condition of GATE6_ABORT_CONDITIONS) {
      expect(condition).not.toMatch(HUMAN_SUPERVISION_PATTERN);
    }
  });

  it('wave-1 monitoring query bundle is SQL/metrics oriented', () => {
    const values = Object.values(GATE6_MONITORING_QUERIES);
    expect(values.length).toBeGreaterThan(0);
    for (const sql of values) {
      expect(sql).toMatch(/SELECT|di_v0_s4|GLOBAL/i);
      expect(sql).not.toMatch(HUMAN_SUPERVISION_PATTERN);
    }
  });

  it('wave-3 fleet scope retains five eligible vehicles and excludes sold KS MX', () => {
    expect(S4_ELIGIBLE_FLEET_VEHICLE_IDS).toHaveLength(5);
    expect(S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS).toContain('a60c0749-a7cd-494e-b5b9-dea3c6b97d63');
    expect([...S4_ELIGIBLE_FLEET_VEHICLE_IDS]).not.toContain('a60c0749-a7cd-494e-b5b9-dea3c6b97d63');
  });
});
