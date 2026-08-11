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

  it('keeps the period contracts byte-identical', () => {
    for (const fileName of [
      'evaluations-period.contract.ts',
      'evaluations-period.validator.ts',
    ]) {
      expect(
        readRepositoryFile(
          `backend/src/synq/evaluations-periods/${fileName}`,
        ),
      ).toBe(
        readRepositoryFile(`shared/evaluations-periods/${fileName}`),
      );
    }
  });

  it('keeps the shared money allowlist byte-identical', () => {
    expect(
      readRepositoryFile(
        'backend/src/synq/money/iso4217-currency-codes.ts',
      ),
    ).toBe(readRepositoryFile('shared/money/iso4217-currency-codes.ts'));
  });

  it('keeps the platform time authority byte-identical', () => {
    expect(
      readRepositoryFile(
        'backend/src/synq/time/platform-time.constants.ts',
      ),
    ).toBe(readRepositoryFile('shared/time/platform-time.constants.ts'));
  });

  it('keeps the analytics foundation contracts byte-identical', () => {
    for (const fileName of [
      'evaluations-analytics.contract.ts',
      'evaluations-analytics.validator.ts',
    ]) {
      expect(
        readRepositoryFile(
          `backend/src/synq/evaluations-analytics/${fileName}`,
        ),
      ).toBe(
        readRepositoryFile(`shared/evaluations-analytics/${fileName}`),
      );
    }
  });

  it('keeps the E3 finance domain contracts byte-identical', () => {
    for (const fileName of [
      'evaluations-money.ts',
      'evaluations-fx.ts',
      'evaluations-finance-facts.ts',
      'evaluations-finance-calculator.ts',
    ]) {
      expect(
        readRepositoryFile(`backend/src/synq/evaluations-finance/${fileName}`),
      ).toBe(readRepositoryFile(`shared/evaluations-finance/${fileName}`));
    }
  });

  it('keeps shared time independent from evaluations contracts', () => {
    expect(
      readRepositoryFile('backend/src/shared/time/iana-timezone.util.ts'),
    ).not.toContain('evaluations-');
  });
});
