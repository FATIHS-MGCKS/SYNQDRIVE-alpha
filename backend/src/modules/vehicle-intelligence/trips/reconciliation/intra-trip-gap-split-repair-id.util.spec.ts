import { buildIntraTripGapSplitRepairAuditId } from './intra-trip-gap-split-repair-id.util';

const GAP_END = new Date('2026-09-02T15:22:57.000Z');
const GAP_START = new Date('2026-09-02T15:26:12.000Z');
const VEHICLE = '8c850ff1-4201-432b-af2e-2711dbc7ca48';

describe('buildIntraTripGapSplitRepairAuditId', () => {
  it('is deterministic for the same semantic inputs', () => {
    const a = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
    const b = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('changes when the vehicle changes', () => {
    const a = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
    const b = buildIntraTripGapSplitRepairAuditId(
      '00000000-0000-4000-8000-000000000001',
      GAP_END,
      GAP_START,
    );
    expect(a).not.toBe(b);
  });

  it('changes when either gap boundary changes', () => {
    const base = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
    const otherEnd = buildIntraTripGapSplitRepairAuditId(
      VEHICLE,
      new Date('2026-09-02T18:55:00.000Z'),
      GAP_START,
    );
    const otherStart = buildIntraTripGapSplitRepairAuditId(
      VEHICLE,
      GAP_END,
      new Date('2026-09-02T18:58:15.000Z'),
    );
    expect(otherEnd).not.toBe(base);
    expect(otherStart).not.toBe(base);
  });
});
