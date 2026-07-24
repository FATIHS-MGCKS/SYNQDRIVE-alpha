import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..');

const REQUIRED_BACKEND_SPECS = [
  'backend/src/modules/bookings/booking-lifecycle-status.matrix.spec.ts',
  'backend/src/modules/bookings/booking-handover-privacy.util.spec.ts',
  'backend/src/modules/bookings/bookings-security-negative.spec.ts',
  'backend/src/modules/bookings/booking-idempotency.characterization.spec.ts',
  'backend/src/modules/bookings/booking-concurrency.characterization.spec.ts',
  'backend/src/modules/bookings/booking-failure-injection.characterization.spec.ts',
  'backend/src/modules/bookings/booking-controller-permissions.characterization.spec.ts',
  'backend/src/modules/bookings/booking-eligibility-gatekeeper/booking-eligibility-status-transition.matrix.spec.ts',
  'backend/src/modules/bookings/booking-pickup-gate/booking-pickup-gate.integration.spec.ts',
  'backend/src/modules/bookings/booking-wizard-draft.service.spec.ts',
  'backend/src/modules/bookings/bookings.service.overlap.spec.ts',
];

const REQUIRED_FRONTEND_SPECS = [
  'frontend/src/rental/lib/booking-wizard-eligibility.test.ts',
  'frontend/src/rental/components/bookings/bookingUtils.test.ts',
  'frontend/e2e/bookings-planner.spec.ts',
];

describe('booking production test matrix audit', () => {
  it('documents matrix file in docs/testing', () => {
    const matrixPath = resolve(REPO_ROOT, 'docs/testing/booking-production-test-matrix.md');
    expect(existsSync(matrixPath)).toBe(true);
    const content = readFileSync(matrixPath, 'utf8');
    expect(content).toContain('SECURITY');
    expect(content).toContain('STATE MACHINE');
    expect(content).toContain('CONCURRENCY');
    expect(content).toContain('IDEMPOTENCY');
    expect(content).toContain('FAILURE INJECTION');
    expect(content).toContain('DATENSCHUTZ');
    expect(content).toContain('FRONTEND');
    expect(content).toContain('Manual-only');
  });

  it('has backend verify script', () => {
    expect(existsSync(resolve(REPO_ROOT, 'backend/scripts/test/booking-backend-verify.sh'))).toBe(true);
  });

  it('has frontend verify script', () => {
    expect(existsSync(resolve(REPO_ROOT, 'frontend/scripts/test/bookings-verify.sh'))).toBe(true);
  });

  it.each(REQUIRED_BACKEND_SPECS)('backend spec exists: %s', (rel) => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });

  it.each(REQUIRED_FRONTEND_SPECS)('frontend spec exists: %s', (rel) => {
    expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
  });
});
