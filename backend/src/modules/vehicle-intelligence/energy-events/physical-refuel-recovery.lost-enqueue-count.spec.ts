import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOST_ENQUEUE_ACTIONABLE_COUNT_USES_DB_AGGREGATE } from './physical-refuel-recovery.repository';

describe('PhysicalRefuelRecoveryRepository lost_enqueue actionable count (F8.2-P9)', () => {
  it('declares DB-side aggregate implementation marker', () => {
    expect(LOST_ENQUEUE_ACTIONABLE_COUNT_USES_DB_AGGREGATE).toBe(true);
  });

  it('uses DB-side COUNT without unbounded findMany materialization', () => {
    const source = readFileSync(join(__dirname, 'physical-refuel-recovery.repository.ts'), 'utf8');
    const fnStart = source.indexOf('export async function countActionableLostEnqueueRecovery');
    const fnEnd = source.indexOf('export function buildCoordinateInitialRecoveryWhere');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).toContain('$queryRaw');
    expect(fnBody).toContain('COUNT(*)');
    expect(fnBody).toContain("r.coordinate_latitude > '-Infinity'::float8");
    expect(fnBody).toContain("r.coordinate_latitude < 'Infinity'::float8");
    expect(fnBody).toContain("r.coordinate_longitude > '-Infinity'::float8");
    expect(fnBody).toContain("r.coordinate_longitude < 'Infinity'::float8");
    expect(fnBody).not.toContain('findMany');
  });
});
