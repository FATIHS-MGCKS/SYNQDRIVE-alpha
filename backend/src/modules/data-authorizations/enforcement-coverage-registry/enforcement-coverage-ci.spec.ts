import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ENFORCEMENT_COVERAGE_CATALOG,
  ENFORCEMENT_COVERAGE_CATALOG_VERSION,
} from './enforcement-coverage-catalog';
import { readBaselineFlowIds, testSpecExists } from './enforcement-coverage-version.util';

const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..', '..');

/**
 * CI gate — unregistered productive data paths and baseline drift fail the build.
 * Run: npm run test:data-auth:coverage
 */
describe('Enforcement coverage registry CI', () => {
  it('catalog version is pinned', () => {
    expect(ENFORCEMENT_COVERAGE_CATALOG_VERSION).toMatch(/^2026-07-prompt25/);
  });

  it('baseline CSV flowIds exist in catalog', () => {
    const baselineIds = readBaselineFlowIds();
    expect(baselineIds.length).toBeGreaterThan(0);
    const catalogIds = new Set(ENFORCEMENT_COVERAGE_CATALOG.map((row) => row.flowId));
    const missing = baselineIds.filter((id) => !catalogIds.has(id));
    expect(missing).toEqual([]);
  });

  it('every productive catalog flow has a test spec on disk', () => {
    const missingTests = ENFORCEMENT_COVERAGE_CATALOG.filter(
      (row) => row.productive && !testSpecExists(row.testSpecPath),
    ).map((row) => `${row.flowId}:${row.testSpecPath}`);
    expect(missingTests).toEqual([]);
  });

  it('baseline CSV matches catalog productive flow count', () => {
    const baselineRaw = readFileSync(
      join(WORKSPACE_ROOT, 'docs/audits/data/data-authorization-enforcement-coverage-baseline-2026-07.csv'),
      'utf8',
    );
    const baselineRows = baselineRaw.split('\n').filter((line) => line.trim() && !line.startsWith('flowId'));
    const productiveCatalog = ENFORCEMENT_COVERAGE_CATALOG.filter((row) => row.productive);
    expect(baselineRows.length).toBe(productiveCatalog.length);
  });

  it('flowIds are unique', () => {
    const ids = ENFORCEMENT_COVERAGE_CATALOG.map((row) => row.flowId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no duplicate processing paths across productive flows unless intentional', () => {
    const paths = ENFORCEMENT_COVERAGE_CATALOG.filter((row) => row.productive).map(
      (row) => row.processingPath,
    );
    const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
    // TRIP_ROUTE_READ appears in live-gps and trip-location intentionally — allow known dupes
    const allowedDupes = new Set([paths.find((p) => p.includes('trip-route'))].filter(Boolean));
    const unexpected = [...new Set(duplicates)].filter((d) => !allowedDupes.has(d));
    expect(unexpected).toEqual([]);
  });
});
