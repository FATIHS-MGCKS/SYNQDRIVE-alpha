import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');

const VITEST_FILES = [
  'src/rental/components/stations/stations-ui-quality.test.ts',
  'src/rental/components/stations/stations-permissions-ui.test.ts',
  'src/rental/components/stations/station-detail-tabs.test.ts',
  'src/rental/components/stations/station-detail-navigation.test.ts',
  'src/rental/components/stations/station-data-states.integration.test.ts',
  'src/rental/components/stations/station-vehicle-workflow.integration.test.ts',
  'src/rental/components/stations/station-team-activity.integration.test.ts',
  'src/rental/lib/stations-tab-a11y.test.ts',
  'src/rental/lib/stations-ui-format.test.ts',
  'src/rental/lib/stations-v2-ui-capabilities.test.ts',
  'src/rental/lib/station-view-state.test.ts',
  'src/rental/lib/station-form.validation.test.ts',
  'src/rental/lib/station-vehicle-workflow.utils.test.ts',
  'src/rental/lib/station-fleet-read-model.utils.test.ts',
  'src/rental/lib/station-overview-decision.utils.test.ts',
  'src/rental/lib/station-org-summaries.utils.test.ts',
  'src/rental/lib/stationUtils.summary.test.ts',
  'src/rental/lib/fleet-station-filter.test.ts',
  'src/rental/lib/stations-v2-test-fixtures.ts',
  'src/rental/components/stations/stations-v2-frontend-package.test.ts',
] as const;

const E2E_FILES = [
  'e2e/stations-v2-fixtures.ts',
  'e2e/stations-v2-flow.spec.ts',
  'e2e/stations-v2-responsive.spec.ts',
] as const;

describe('stations v2 frontend package inventory', () => {
  it('includes all documented vitest files', () => {
    for (const file of VITEST_FILES) {
      expect(existsSync(resolve(root, file)), `missing ${file}`).toBe(true);
    }
  });

  it('includes playwright e2e specs and fixtures', () => {
    for (const file of E2E_FILES) {
      expect(existsSync(resolve(root, file)), `missing ${file}`).toBe(true);
    }
  });

  it('documents coverage matrix', () => {
    expect(
      existsSync(resolve(root, '../docs/testing/stations-v2-frontend-e2e-coverage.md')),
    ).toBe(true);
  });
});
