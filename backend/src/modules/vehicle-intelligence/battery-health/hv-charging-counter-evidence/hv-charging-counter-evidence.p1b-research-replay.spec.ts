import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { evaluateHvChargingCounterQualityV1 } from './hv-charging-counter-evidence.counter-quality.v1';
import {
  resolveHvPhysicalSessionValidityV1,
  resolveHvScientificQualityLayerV1,
} from './hv-charging-counter-evidence.session-authority-layers.v1';
import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'p1b-research');

type ResearchArtifact = {
  caseId: string;
  sessionId: string;
  sessionWindow: { from: string; to: string };
  queryWindow: { from: string; to: string };
  rows: HvChargingCounterDimoIntervalRowV1[];
};

type ProductionSession = {
  id: string;
  source: string;
  isOngoing: boolean;
  endAt: string;
  metadata: unknown;
};

describe('HV R22 P1B research replay (11 sessions)', () => {
  const expectations = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'p1b-research-expectations.v1.json'), 'utf8'),
  ) as Record<
    string,
    {
      energyDerivationQuality: string;
      reliableSessionCounterDelta: boolean;
      physical: string;
      h4Eligible: boolean;
    }
  >;

  const production = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'session-authority-fixtures.v1.json'), 'utf8'),
  ) as ProductionSession[];

  const artifacts = readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('-dimo-response.json'))
    .map((name) => {
      const art = JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as ResearchArtifact;
      return art;
    });

  it('replays all eleven research sessions without mutating row values', () => {
    expect(artifacts).toHaveLength(11);
  });

  for (const art of artifacts) {
    const prod = production.find((row) => row.id === art.sessionId);
    if (!prod) {
      throw new Error(`missing session authority fixture for ${art.sessionId}`);
    }

    it(`classifies ${art.caseId} per authority layers`, () => {
      const rowsBefore = JSON.stringify(art.rows);
      const quality = evaluateHvChargingCounterQualityV1({
        sessionStartInclusive: art.sessionWindow.from,
        sessionEndInclusive: art.sessionWindow.to,
        queryFromInclusive: art.queryWindow.from,
        queryToInclusive: art.queryWindow.to,
        rows: art.rows,
      });
      expect(JSON.stringify(art.rows)).toBe(rowsBefore);

      const physical = resolveHvPhysicalSessionValidityV1({
        source: prod.source,
        isOngoing: prod.isOngoing,
        endAt: new Date(prod.endAt),
        metadata: prod.metadata,
      });
      const scientific = resolveHvScientificQualityLayerV1(prod.metadata);
      const expected = expectations[art.caseId];

      expect(physical).toBe(expected.physical);
      expect(scientific.h4ThroughputEligible).toBe(expected.h4Eligible);
      expect(quality.energyDerivationQuality).toBe(expected.energyDerivationQuality);
      expect(quality.reliableSessionCounterDelta).toBe(expected.reliableSessionCounterDelta);
      expect(quality.numericCoverage.numericLastCount).toBeGreaterThan(0);
    });
  }
});
