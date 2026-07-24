import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('evaluations financial-mtd API contract', () => {
  const apiPath = join(__dirname, '../../../lib/api.ts');
  const source = readFileSync(apiPath, 'utf8');

  it('exposes financialMtd client on api.evaluations', () => {
    expect(source).toContain('evaluations:');
    expect(source).toContain('financialMtd:');
    expect(source).toContain('/evaluations/kpis/financial-mtd');
  });

  it('financial-mtd response includes metrics array and schemaVersion', () => {
    const block = source.slice(
      source.indexOf('financialMtd:'),
      source.indexOf('dashboardInsights:'),
    );
    expect(block).toContain('schemaVersion');
    expect(block).toContain('metrics:');
    expect(block).toContain('EvaluationsMetricResponse');
  });

  it('does not use heuristic cent-to-euro division in evaluations money helpers', () => {
    const moneyPath = join(__dirname, '../evaluations/evaluations-money.ts');
    const moneySource = readFileSync(moneyPath, 'utf8');
    expect(moneySource).not.toMatch(/\/\s*100\b.*eur/i);
    expect(moneySource).toContain('chartMajorFromMinor');
  });
});
