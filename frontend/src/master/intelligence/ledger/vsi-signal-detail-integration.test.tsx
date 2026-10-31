// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import {
  buildMasterIntelligenceSearch,
  parseMasterIntelligenceContext,
  pushMasterIntelligenceUrl,
} from '../master-intelligence-url';
import { EMPTY_MASTER_INTELLIGENCE_CONTEXT } from '../master-intelligence.types';
import { EMPTY_VSI_LEDGER_FILTERS } from '../vsi-ledger-url.types';
import { VsiSignalLedgerTab } from './VsiSignalLedgerTab';
import { VsiSignalDetailContent } from './VsiSignalDetailContent';
import { parseLvCadenceEvidence } from './parse-lv-cadence-evidence.util';
import { parseRpmCadenceDetail } from './parse-rpm-cadence-detail.util';
import {
  ARTEON_ENGINE_RPM_SIGNAL,
  ATTRIBUTION_LIMITED_RPM,
  AUDI_ENGINE_RPM_SIGNAL,
  BEV_NOT_APPLICABLE_SIGNAL,
  buildTestProfileDetail,
  LV_WITH_CADENCE_SIGNAL,
  MALFORMED_CADENCE_SIGNAL,
  STALE_OBSERVATION_SIGNAL,
  TIGUAN_ENGINE_RPM_SIGNAL,
  UNKNOWN_APPLICABILITY_SIGNAL,
} from './ledger-test-fixtures';

describe('VSI signal detail URL history', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/master?view=vsi-intelligence&orgId=00000000-0000-4000-8000-000000000001&vehicleId=00000000-0000-4000-8000-000000000002&tab=ledger');
  });

  it('pushState on open and replaceState on close without duplicate close entries', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    pushMasterIntelligenceUrl('vsi-intelligence', {
      ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
      orgId: '00000000-0000-4000-8000-000000000001',
      vehicleId: '00000000-0000-4000-8000-000000000002',
      vsiTab: 'ledger',
      signalKey: 'engine_rpm',
      ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS },
    });
    expect(pushSpy).toHaveBeenCalled();
    expect(window.location.search).toContain('signalKey=engine_rpm');

    pushMasterIntelligenceUrl(
      'vsi-intelligence',
      {
        ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
        orgId: '00000000-0000-4000-8000-000000000001',
        vehicleId: '00000000-0000-4000-8000-000000000002',
        vsiTab: 'ledger',
        signalKey: null,
        ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS },
      },
      { replace: true },
    );
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.search).not.toContain('signalKey=');
  });

  it('popstate restores signalKey for forward/back navigation', () => {
    pushMasterIntelligenceUrl('vsi-intelligence', {
      ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
      orgId: '00000000-0000-4000-8000-000000000001',
      vehicleId: '00000000-0000-4000-8000-000000000002',
      vsiTab: 'ledger',
      signalKey: 'vehicle_speed',
      ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS },
    });
    const withSignal = parseMasterIntelligenceContext(window.location.search);
    expect(withSignal.signalKey).toBe('vehicle_speed');

    window.history.back();
    const afterBack = parseMasterIntelligenceContext(window.location.search);
    expect(afterBack.signalKey).toBeNull();

    window.history.forward();
    const afterForward = parseMasterIntelligenceContext(window.location.search);
    expect(afterForward.signalKey).toBe('vehicle_speed');
  });

  it('rejects invalid signalKey safely', () => {
    window.history.replaceState(
      null,
      '',
      '/master?view=vsi-intelligence&signalKey=INVALID-KEY!',
    );
    const ctx = parseMasterIntelligenceContext(window.location.search);
    expect(ctx.signalKey).toBeNull();
    expect(ctx.rejectedParams).toContain('signalKey');
  });

  it('buildMasterIntelligenceSearch round-trips ledger state', () => {
    const ctx = {
      ...EMPTY_MASTER_INTELLIGENCE_CONTEXT,
      orgId: '00000000-0000-4000-8000-000000000001',
      vehicleId: '00000000-0000-4000-8000-000000000002',
      vsiTab: 'ledger' as const,
      signalKey: 'engine_rpm',
      ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS, q: 'rpm' },
    };
    const qs = buildMasterIntelligenceSearch('vsi-intelligence', ctx);
    const parsed = parseMasterIntelligenceContext(qs);
    expect(parsed.signalKey).toBe('engine_rpm');
    expect(parsed.ledgerFilters.q).toBe('rpm');
  });
});

describe('VSI signal detail parsers', () => {
  it('parseLvCadenceEvidence reads LV standby block', () => {
    const lv = parseLvCadenceEvidence(LV_WITH_CADENCE_SIGNAL.cadenceIntelligence);
    expect(lv?.standbyProfile).toBe('LV_8H_OBSERVED');
    expect(lv?.evidenceConfidence).toBe('HIGH');
  });

  it('parseRpmCadenceDetail tolerates malformed cadence blob', () => {
    const detail = parseRpmCadenceDetail(MALFORMED_CADENCE_SIGNAL);
    expect(detail?.regimes).toEqual([]);
    expect(detail?.tierResolution).toBeNull();
  });

  it('parseRpmCadenceDetail reads Tiguan regimes and RPM_1HZ profile', () => {
    const detail = parseRpmCadenceDetail(TIGUAN_ENGINE_RPM_SIGNAL);
    expect(detail?.regimes.length).toBe(1);
    expect(detail?.observedDensityLabel).toBe('ONE_SECOND_BUCKETS_UNPROVEN');
  });
});

describe('VsiSignalDetailContent', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mountDetail(signal: typeof AUDI_ENGINE_RPM_SIGNAL) {
    const profile = buildTestProfileDetail([
      signal,
      STALE_OBSERVATION_SIGNAL,
      UNKNOWN_APPLICABILITY_SIGNAL,
    ]);
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(VsiSignalDetailContent, {
            profile,
            signal,
            formatTimestamp: (iso) => iso ?? '—',
          }),
        ),
      );
    });
  }

  it('shows independent NEVER_OBSERVED and PROVEN_HISTORICAL_ONLY dimensions', () => {
    mountDetail(AUDI_ENGINE_RPM_SIGNAL);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Never observed/i);
    expect(text).toMatch(/Proven historical only/i);
    expect(text).toMatch(/Compatible statements/i);
  });

  it('shows BEV NOT_APPLICABLE combined RPM without live inference', () => {
    mountDetail(BEV_NOT_APPLICABLE_SIGNAL);
    expect(document.body.textContent).toMatch(/Not applicable/i);
  });

  it('shows attribution-unproven limitation with amber styling', () => {
    mountDetail(ATTRIBUTION_LIMITED_RPM);
    expect(document.querySelector('.border-amber-500\\/40')).toBeTruthy();
    expect(document.body.textContent).toContain('RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN');
  });

  it('shows fetch disclaimer when provider fetch is present', () => {
    mountDetail(AUDI_ENGINE_RPM_SIGNAL);
    expect(document.body.textContent).toMatch(/does not prove a new sensor measurement/i);
  });

  it('shows em dash for missing confidence without implying error', () => {
    mountDetail(UNKNOWN_APPLICABILITY_SIGNAL);
    expect(document.body.textContent).toMatch(/Confidence/);
    expect(document.body.textContent).toContain('—');
  });

  it('renders RPM dual provenance panel for engine_rpm', () => {
    mountDetail(TIGUAN_ENGINE_RPM_SIGNAL);
    expect(document.querySelector('[data-testid="vsi-engine-rpm-dual-provenance"]')).toBeTruthy();
    expect(document.body.textContent).toMatch(/RPM_1HZ/i);
  });

  it('renders Arteon PROVEN_LIVE combined evidence without inventing scores', () => {
    mountDetail(ARTEON_ENGINE_RPM_SIGNAL);
    expect(document.body.textContent).toMatch(/Proven live/i);
    expect(document.body.textContent).not.toMatch(/health score/i);
  });

  it('renders LV cadence section when present', () => {
    const profile = buildTestProfileDetail([LV_WITH_CADENCE_SIGNAL]);
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(VsiSignalDetailContent, {
            profile,
            signal: LV_WITH_CADENCE_SIGNAL,
            formatTimestamp: (iso) => iso ?? '—',
          }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/LV_8H_OBSERVED/);
  });
});

describe('VsiSignalLedgerTab detail sheet integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  function mountLedger(
    selectedSignalKey: string | null,
    handlers: {
      onOpenSignal: (k: string) => void;
      onCloseSignal: () => void;
      onNavigateSignal: (k: string) => void;
    },
  ) {
    const profile = buildTestProfileDetail([
      AUDI_ENGINE_RPM_SIGNAL,
      STALE_OBSERVATION_SIGNAL,
      UNKNOWN_APPLICABILITY_SIGNAL,
    ]);
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(VsiSignalLedgerTab, {
            profile,
            multiLinkCount: 1,
            filters: { ...EMPTY_VSI_LEDGER_FILTERS },
            onFiltersChange: () => {},
            onFiltersClear: () => {},
            selectedSignalKey,
            onOpenSignal: handlers.onOpenSignal,
            onCloseSignal: handlers.onCloseSignal,
            onNavigateSignal: handlers.onNavigateSignal,
            vehicleContextLabel: 'VW Tiguan',
            linkContextLabel: 'DIMO · rev 7',
            formatTimestamp: (iso) => iso ?? '—',
          }),
        ),
      );
    });
  }

  it('opens sheet when selected signal is in filtered rows', () => {
    mountLedger('engine_rpm', {
      onOpenSignal: vi.fn(),
      onCloseSignal: vi.fn(),
      onNavigateSignal: vi.fn(),
    });
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="sheet-title"]')?.textContent).toBe('engine_rpm');
  });

  it('does not open sheet when signal is filtered out', () => {
    const profile = buildTestProfileDetail([AUDI_ENGINE_RPM_SIGNAL]);
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(VsiSignalLedgerTab, {
            profile,
            multiLinkCount: 1,
            filters: { ...EMPTY_VSI_LEDGER_FILTERS, q: 'no-match-xyz' },
            onFiltersChange: () => {},
            onFiltersClear: () => {},
            selectedSignalKey: 'engine_rpm',
            onOpenSignal: vi.fn(),
            onCloseSignal: vi.fn(),
            onNavigateSignal: vi.fn(),
            vehicleContextLabel: null,
            linkContextLabel: null,
            formatTimestamp: (iso) => iso ?? '—',
          }),
        ),
      );
    });
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeFalsy();
    expect(document.body.textContent).toMatch(/hidden by current filters/i);
  });

  it('navigates prev/next over filtered signals via header buttons', () => {
    const onNavigate = vi.fn();
    mountLedger('vehicle_speed', {
      onOpenSignal: vi.fn(),
      onCloseSignal: vi.fn(),
      onNavigateSignal: onNavigate,
    });
    const nextBtn = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'Next signal',
    );
    expect(nextBtn).toBeTruthy();
    act(() => nextBtn!.click());
    expect(onNavigate).toHaveBeenCalled();
  });

  it('restores focus to originating row after close', async () => {
    vi.useFakeTimers();
    let selected: string | null = 'engine_rpm';
    const profile = buildTestProfileDetail([
      AUDI_ENGINE_RPM_SIGNAL,
      STALE_OBSERVATION_SIGNAL,
      UNKNOWN_APPLICABILITY_SIGNAL,
    ]);

    const renderLedger = () => {
      act(() => {
        root.render(
          createElement(
            LanguageProvider,
            null,
            createElement(VsiSignalLedgerTab, {
              profile,
              multiLinkCount: 1,
              filters: { ...EMPTY_VSI_LEDGER_FILTERS },
              onFiltersChange: () => {},
              onFiltersClear: () => {},
              selectedSignalKey: selected,
              onOpenSignal: (k) => {
                selected = k;
                renderLedger();
              },
              onCloseSignal: () => {
                selected = null;
                renderLedger();
              },
              onNavigateSignal: (k) => {
                selected = k;
                renderLedger();
              },
              vehicleContextLabel: 'VW Tiguan',
              linkContextLabel: 'DIMO · rev 7',
              formatTimestamp: (iso) => iso ?? '—',
            }),
          ),
        );
      });
    };

    renderLedger();

    const rowBtn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('engine_rpm'),
    ) as HTMLButtonElement | undefined;
    expect(rowBtn).toBeTruthy();
    rowBtn!.focus();

    const closeBtn = [...document.querySelectorAll('button')].find(
      (b) => b.className.includes('right-4') && b.className.includes('absolute'),
    );
    expect(closeBtn).toBeTruthy();
    act(() => closeBtn!.click());
    act(() => {
      vi.runAllTimers();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(selected).toBeNull();
    const focused = document.activeElement as HTMLElement;
    expect(focused?.textContent).toContain('engine_rpm');
    vi.useRealTimers();
  });
});
