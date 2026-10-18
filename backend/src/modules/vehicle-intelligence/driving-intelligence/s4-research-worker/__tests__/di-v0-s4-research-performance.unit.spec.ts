/**
 * Performance budget guard: 1136-bucket Tesla replay (reference ~78.6s on owner dev hardware; cap = maxProcessingMsPerTrip 120s).
 * Skips on CI when fixture absent.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildRoadContextFromOverpass,
  runRoadMatchingPipeline,
} from '../../s4-research';
import { DI_V0_S4_RESEARCH_V2_TUNING } from '../di-v0-s4-research-v2.config';

const repoRoot = path.resolve(__dirname, '../../../../../../..');
const osmPath = path.join(
  repoRoot,
  'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json',
);
const gridPath = path.join(
  repoRoot,
  'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016/TESLA_POSITION_GRID.json',
);

describe('s4-research V2 performance budget (Tesla 1136 buckets)', () => {
  const hasFixture = fs.existsSync(osmPath) && fs.existsSync(gridPath);
  const testFn = hasFixture ? it : it.skip;

  testFn(
    `full pipeline completes under ${DI_V0_S4_RESEARCH_V2_TUNING.maxProcessingMsPerTrip}ms budget`,
    () => {
      const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8')) as {
        buckets: Array<{
          bucketLabelUtc: string;
          availability: string;
          latitude: number | null;
          longitude: number | null;
          pinnedProductionL3Kmh?: number | null;
        }>;
      };
      const buckets = grid.buckets.map((b) => ({
        bucketLabelUtc: b.bucketLabelUtc,
        availability: b.availability as 'PRESENT' | 'ROW_ABSENT',
        latitude: b.latitude,
        longitude: b.longitude,
        l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
      }));
      const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: unknown };
      const t0 = Date.now();
      const ctx = buildRoadContextFromOverpass(osm.overpassResponse as { elements?: Array<Record<string, unknown>> }, {
        buckets,
        corridorMarginM: 75,
      });
      runRoadMatchingPipeline({
        buckets,
        roadContext: ctx,
        config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
      });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(DI_V0_S4_RESEARCH_V2_TUNING.maxProcessingMsPerTrip);
    },
    DI_V0_S4_RESEARCH_V2_TUNING.maxProcessingMsPerTrip + 10_000,
  );
});
