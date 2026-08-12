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
} from '../../lib/evaluations/evaluations-canonical.types';

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
  return {
    status: 'AVAILABLE',
    calculationVersion: 'v',
    period: {},
    scope: { organizationId: 'org-a', stationIds: null, stationScoped: false },
    coverage: null,
    generatedAt: '2026-06-16T12:00:00.000Z',
    reason: null,
    disclaimer: 'Association only, not causation.',
    confounders: ['seasonality'],
    factors,
    piiTier,
    ...extra,
  } as unknown as EvaluationsDriverInfluenceSection;
}

const FACTORS: E4DriverFactor[] = [
  { driverRef: 'driver-REF-1', associatedDimension: 'HARSH_BRAKING', associationShare: 0.6, sampleSize: 42, relationship: 'ASSOCIATED_WITH' },
  { driverRef: 'driver-REF-2', associatedDimension: 'IDLING', associationShare: 0.4, sampleSize: 18, relationship: 'CORRELATES_WITH' },
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

  it('none tier renders no driver references', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('none', FACTORS) });
    render();
    toggle();
    await flush();
    expect(container.textContent ?? '').not.toContain('driver-REF-1');
    expect(container.querySelector('[data-testid="evaluations-driver-none-restricted"]')).not.toBeNull();
  });

  it('fail-closed reason remains visible (e.g. PERSON_LEVEL_ACCESS_DENIED)', async () => {
    driverMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: driverData('none', [], { status: 'UNAVAILABLE', reason: 'PERSON_LEVEL_ACCESS_DENIED' }),
    });
    render();
    toggle();
    await flush();
    expect(container.textContent ?? '').toContain('PERSON_LEVEL_ACCESS_DENIED');
  });

  it('renders associationShare and sampleSize without re-ranking, plus disclaimer & confounders, no causal language', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', FACTORS) });
    render();
    toggle();
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('60%'); // associationShare 0.6
    expect(text).toContain('n=42'); // sampleSize
    expect(text).toContain('Association only, not causation.'); // disclaimer verbatim
    expect(text).toContain('seasonality'); // confounder verbatim
    for (const banned of ['caused', 'responsible for', 'blame', 'proves']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });

  it('empty factors (AVAILABLE) show qualified neutral copy, not "no driver influence"', async () => {
    driverMock.mockResolvedValue({ ok: true, status: 200, data: driverData('full', []) });
    render();
    toggle();
    await flush();
    expect(container.querySelector('[data-testid="evaluations-driver-empty"]')).not.toBeNull();
    expect((container.textContent ?? '').toLowerCase()).not.toContain('no driver influence');
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
