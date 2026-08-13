// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import type { RequestResult } from '../../../lib/api';
import type {
  EvaluationsDriverInfluenceSection,
  EvaluationsPiiTier,
  E4DriverFactor,
  EvaluationsDataCoverage,
  EvaluationsPeriodWindow,
} from '../../lib/evaluations/evaluations-canonical.types';

const PERIOD = {
  periodType: 'MTD',
  start: '2026-06-01T00:00:00.000Z',
  endExclusive: '2026-07-01T00:00:00.000Z',
  reference: '2026-06-16T12:00:00.000Z',
  timezone: {
    effectiveTimezone: 'Europe/Berlin',
    source: 'ORGANIZATION',
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'Europe/Berlin',
  },
  comparisonBasis: null,
} satisfies EvaluationsPeriodWindow;

// Canonical driver coverage (executable authority): availableRecords ALWAYS equals the
// analyzed factor count, excludedRecords is the unattributed count, expected/ratio are
// null, and missingSources mirrors dimensionsSkippedInsufficient.
function driverCoverage(
  availableRecords: number,
  excludedRecords: number,
  missingSources: readonly string[],
): EvaluationsDataCoverage {
  return { expectedRecords: null, availableRecords, excludedRecords, ratio: null, missingSources };
}

const driverMock =
  vi.fn<(orgId: string, req?: unknown) => Promise<RequestResult<EvaluationsDriverInfluenceSection>>>();

vi.mock('../../../lib/api', () => ({
  api: { evaluations: { driverAnalysis: (orgId: string, req?: unknown) => driverMock(orgId, req) } },
}));

import { DriverInfluenceSection } from './DriverInfluenceSection';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  driverMock.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() =>
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(DriverInfluenceSection, { organizationId: 'org-a', req: { periodType: 'MTD' } }),
      ),
    ),
  );
}
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
function toggle() {
  const btn = container.querySelector('[data-testid="evaluations-driver-toggle"]') as HTMLButtonElement;
  act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function driverData(
  piiTier: EvaluationsPiiTier,
  factors: E4DriverFactor[],
  extra?: Partial<EvaluationsDriverInfluenceSection>,
): EvaluationsDriverInfluenceSection {
  const base: EvaluationsDriverInfluenceSection = {
    status: 'AVAILABLE',
    calculationVersion: 'driver-influence-e4-v1',
    period: PERIOD,
    scope: { organizationId: 'org-a', stationIds: null, stationScoped: false },
    // availableRecords === factors.length (executable authority). Empty/none/failClosed
    // cases override coverage explicitly via `extra`.
    coverage: factors.length > 0 ? driverCoverage(factors.length, 3, []) : null,
    generatedAt: '2026-06-16T12:00:00.000Z',
    reason: null,
    disclaimer:
      'Driver influence factors indicate statistical association only. Correlation is not causation; no causal claim is made about any individual driver.',
    confounders: ['seasonality'],
    factors,
    piiTier,
  };
  return { ...base, ...extra };
}

// Canonical analyzed dimension is BOOKING_CANCELLATIONS (association-only).
// associationShare === sampleSize / dimension total (6/10 = 0.6, 4/10 = 0.4).
const FACTORS: E4DriverFactor[] = [
  { driverRef: 'driver-REF-1', associatedDimension: 'BOOKING_CANCELLATIONS', associationShare: 0.6, sampleSize: 6, relationship: 'ASSOCIATED_WITH' },
  { driverRef: 'driver-REF-2', associatedDimension: 'BOOKING_CANCELLATIONS', associationShare: 0.4, sampleSize: 4, relationship: 'ASSOCIATED_WITH' },
];

describe('E6C DriverInfluenceSection — lazy request lifecycle', () => {
  it('issues no driver request before the explicit reveal', () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', FACTORS) });
    render();
    expect(driverMock).not.toHaveBeenCalled();
  });

  it('issues exactly one request after the first reveal', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', FACTORS) });
    render();
    toggle();
    await flush();
    expect(driverMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="evaluations-driver-content"]')).not.toBeNull();
  });

  it('collapse then reopen does not issue a second request', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', FACTORS) });
    render();
    toggle(); // reveal
    await flush();
    toggle(); // collapse
    await flush();
    toggle(); // reopen
    await flush();
    expect(driverMock).toHaveBeenCalledTimes(1);
  });
});

describe('E6C DriverInfluenceSection — privacy tiers & rendering', () => {
  it('full tier renders the returned driverRef verbatim, in server order', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', FACTORS) });
    render();
    toggle();
    await flush();
    const rows = container.querySelectorAll('[data-testid="evaluations-driver-factor"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent ?? '').toContain('driver-REF-1'); // order preserved
    expect(rows[1].textContent ?? '').toContain('driver-REF-2');
  });

  it('pseudonymous tier renders the pseudonym verbatim (not resolved)', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('pseudonymous', [FACTORS[0]]) });
    render();
    toggle();
    await flush();
    expect(container.textContent ?? '').toContain('driver-REF-1');
    expect(container.querySelector('[data-testid="evaluations-driver-piitier-pseudonymous"]')).not.toBeNull();
  });

  it('none tier (canonical: PERSON_LEVEL_ACCESS_DENIED, factors []) renders no driver references + reason', async () => {
    // Backend-reachable none: UNAVAILABLE, factors [], coverage null.
    driverMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: driverData('none', [], { status: 'UNAVAILABLE', reason: 'PERSON_LEVEL_ACCESS_DENIED', coverage: null }),
    });
    render();
    toggle();
    await flush();
    expect(container.textContent ?? '').not.toContain('driver-REF-1');
    expect(container.querySelector('[data-testid="evaluations-driver-piitier-none"]')).not.toBeNull();
    expect(container.textContent ?? '').toContain('PERSON_LEVEL_ACCESS_DENIED');
    // Canonical empty factors → the empty state (not the adversarial none-restricted branch).
    expect(container.querySelector('[data-testid="evaluations-driver-empty"]')).not.toBeNull();
  });

  it('ADVERSARIAL (malformed server payload): none tier + factors → references still suppressed (none-restricted)', async () => {
    // NOT backend-reachable — the executable authority never returns none + factors.
    // Defense-in-depth: even if a malformed payload arrived, no reference may leak.
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('none', FACTORS) });
    render();
    toggle();
    await flush();
    expect(container.textContent ?? '').not.toContain('driver-REF-1');
    expect(container.querySelector('[data-testid="evaluations-driver-none-restricted"]')).not.toBeNull();
  });

  it('renders associationShare and sampleSize without re-ranking, plus disclaimer & confounders, no causal language', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', FACTORS) });
    render();
    toggle();
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('60%'); // associationShare 0.6 (= 6/10)
    expect(text).toContain('n=6'); // sampleSize
    expect(text).toContain('statistical association only'); // canonical disclaimer verbatim
    expect(text).toContain('seasonality'); // confounder verbatim
    for (const banned of ['caused', 'responsible for', 'blame', 'proves']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });

  it('empty factors (AVAILABLE, backend-reachable) keep non-null coverage with availableRecords 0; qualified copy', async () => {
    // A dimension was analyzed but no driver met the per-driver minimum: AVAILABLE,
    // reason null, factors [], coverage non-null with availableRecords 0.
    driverMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: driverData('full', [], { status: 'AVAILABLE', reason: null, coverage: driverCoverage(0, 2, []) }),
    });
    render();
    toggle();
    await flush();
    expect(container.querySelector('[data-testid="evaluations-driver-empty"]')).not.toBeNull();
    expect((container.textContent ?? '').toLowerCase()).not.toContain('no driver influence');
    const cov = container.querySelector('[data-testid="evaluations-driver-coverage"]')!;
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-available"]')?.textContent ?? '').toContain('0');
  });
});

describe('E6C.1.1 DriverInfluenceSection — canonical coverage authority', () => {
  it('AVAILABLE 2-factor coverage: available=2, excluded=3, expected/ratio unavailable, no missing sources; factors not reordered', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', FACTORS) });
    render();
    toggle();
    await flush();
    const cov = container.querySelector('[data-testid="evaluations-driver-coverage"]')!;
    // availableRecords === factor count (2).
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-available"]')?.textContent ?? '').toContain('2');
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-excluded"]')?.textContent ?? '').toContain('3');
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-expected"]')?.textContent ?? '').toContain('—');
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-ratio"]')?.textContent ?? '').toContain('—');
    // Analyzed dimension is not skipped → canonical "no missing sources" state.
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-missing-sources"]')?.textContent ?? '').toContain('No missing sources reported');
    const rows = container.querySelectorAll('[data-testid="evaluations-driver-factor"]');
    expect(rows[0].textContent ?? '').toContain('driver-REF-1');
    expect(rows[1].textContent ?? '').toContain('driver-REF-2');
  });

  it('insufficient evidence: DRIVER_EVIDENCE_INSUFFICIENT, no factors, missingSources=[BOOKING_CANCELLATIONS]', async () => {
    driverMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: driverData('full', [], { status: 'UNAVAILABLE', reason: 'DRIVER_EVIDENCE_INSUFFICIENT', coverage: driverCoverage(0, 4, ['BOOKING_CANCELLATIONS']) }),
    });
    render();
    toggle();
    await flush();
    const cov = container.querySelector('[data-testid="evaluations-driver-coverage"]')!;
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-available"]')?.textContent ?? '').toContain('0');
    expect(cov.querySelector('[data-testid="evaluations-driver-coverage-missing-sources"]')?.textContent ?? '').toContain('BOOKING_CANCELLATIONS');
    expect(container.textContent ?? '').toContain('DRIVER_EVIDENCE_INSUFFICIENT');
    expect(container.querySelectorAll('[data-testid="evaluations-driver-factor"]').length).toBe(0);
  });

  it('fail-closed PSEUDONYMIZATION_UNAVAILABLE uses the pseudonymous tier, null coverage neutral, no references', async () => {
    driverMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: driverData('pseudonymous', [], { status: 'UNAVAILABLE', reason: 'PSEUDONYMIZATION_UNAVAILABLE', coverage: null }),
    });
    render();
    toggle();
    await flush();
    // Pseudonymization fails only AFTER person-level access was granted → tier stays pseudonymous.
    expect(container.querySelector('[data-testid="evaluations-driver-piitier-pseudonymous"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="evaluations-driver-coverage"]')?.textContent ?? '').toContain('Not available for this scope');
    expect(container.textContent ?? '').toContain('PSEUDONYMIZATION_UNAVAILABLE');
    expect(container.querySelectorAll('[data-testid="evaluations-driver-factor"]').length).toBe(0);
  });
});

describe('E6C DriverInfluenceSection — transport states distinct', () => {
  async function revealWith(r: RequestResult<EvaluationsDriverInfluenceSection>) {
    driverMock.mockResolvedValue(r);
    render();
    toggle();
    await flush();
  }

  it('403 → UNAUTHORIZED copy', async () => {
    await revealWith({ ok: false, status: 403, errorMessage: 'Forbidden' });
    expect(container.textContent ?? '').toContain('not authorized');
  });

  it('generic 404 → neutral NOT_FOUND copy, never feature disabled', async () => {
    await revealWith({ ok: false, status: 404, errorMessage: 'Not found' });
    const text = container.textContent ?? '';
    expect(text).toContain('Analytics are not available for this scope.');
    expect(text.toLowerCase()).not.toContain('disabled');
  });

  it('500 → ERROR copy', async () => {
    await revealWith({ ok: false, status: 500, errorMessage: 'Server error' });
    expect(container.textContent ?? '').toContain('could not be loaded');
  });
});
