import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPOSITORY_ROOT = resolve(__dirname, '../../../..');

const METRIC_CONTRACT_FILES = [
  'evaluations-calculation-provenance.ts',
  'evaluations-financial-provenance.ts',
  'evaluations-metric-calculation-versions.ts',
  'evaluations-metric-response.builder.ts',
  'evaluations-metric-response.contract.ts',
  'evaluations-metric-response.validator.ts',
  'evaluations-metric.contract.ts',
  'evaluations-metric.i18n.ts',
  'evaluations-metric.legacy-map.ts',
] as const;

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

describe('evaluations shared contract backend build mirror', () => {
  it.each(METRIC_CONTRACT_FILES)('keeps %s byte-identical', (fileName) => {
    expect(
      readRepositoryFile(`backend/src/synq/evaluations-metrics/${fileName}`),
    ).toBe(readRepositoryFile(`shared/evaluations-metrics/${fileName}`));
  });

  it('keeps the period contract byte-identical', () => {
    expect(
      readRepositoryFile(
        'backend/src/synq/evaluations-periods/evaluations-period.contract.ts',
      ),
    ).toBe(
      readRepositoryFile(
        'shared/evaluations-periods/evaluations-period.contract.ts',
      ),
    );
  });
});
