// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatteryV2ShadowInspectionView from './BatteryV2ShadowInspectionView';
import type { RestSessionFeatureShadowInspectionV1 } from './types';

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      operationalList: vi.fn(async () => ({
        data: [
          {
            vehicleId: 'veh-1',
            organizationId: 'org-1',
            licensePlate: 'SD-100',
            make: 'VW',
            model: 'Golf',
            vin: 'VIN100',
          },
        ],
        meta: { total: 1, page: 1, limit: 200, totalPages: 1 },
      })),
    },
    admin: {
      batteryV2: {
        listRestSessions: vi.fn(async () => ({
          sessions: [
            {
              id: 'sess-1',
              organizationId: 'org-1',
              vehicleId: 'veh-1',
              sessionStatus: 'RESTING',
              anchorType: 'ENGINE_OFF',
              anchorAt: '2026-09-23T10:00:00.000Z',
              openedAt: '2026-09-23T10:00:00.000Z',
              endedAt: null,
              endReason: null,
              restObservationCount: 2,
              validRestObservationCount: 2,
            },
          ],
        })),
        inspectRestSessionFeature: vi.fn(),
      },
    },
  },
}));

import { api } from '../../lib/api';

function buildInspection(
  overallStatus: RestSessionFeatureShadowInspectionV1['integrity']['overallStatus'],
): RestSessionFeatureShadowInspectionV1 {
  return {
    inspectionContractVersion: 'M3_3C_C5A_V1',
    versionTuple: {
      featureModelVersion: 'M3_3C_C3_V1',
      retentionPolicyVersion: 'M3_3C_C1_V1',
      chargeOpportunityPolicyVersion: 'M3_3C_C2_V1',
      inputContractVersion: 'M3_3C_FEATURE_INPUT_V1',
    },
    session: {
      id: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      anchorType: 'ENGINE_OFF',
      anchorAt: '2026-09-23T10:00:00.000Z',
      sessionStatus: 'RESTING',
      candidateTripId: null,
      confirmedTripId: null,
      openedAt: '2026-09-23T10:00:00.000Z',
      confirmedAt: null,
      endedAt: null,
      endReason: null,
      restObservationCount: 2,
      validRestObservationCount: 2,
    },
    featureSummary: {
      totalRows: 1,
      latestSemanticRevision: 1,
      incrementalRows: 1,
      finalRows: 0,
      validRows: 1,
      invalidatedRows: 0,
      canonicalFeatureRowId: 'row-1',
      canonicalSemanticRevision: 1,
      revisionsTruncated: false,
    },
    canonicalFeature: {
      id: 'row-1',
      semanticRevision: 1,
      inputDigest: 'abc',
      computationPhase: 'INCREMENTAL',
      sessionTrust: 'VALID',
      chargeOpportunityClass: 'UNKNOWN',
      numberOfValidRestPoints: 3,
      shutdownToFirstRestDeltaMv: 12000,
      robustRestSlopeMvPerHour: -4.5,
      minimumRestVoltageMv: 121000,
      maximumRestVoltageMv: 122000,
      medianRestVoltageMv: 121500,
      restVoltageVarianceMv2: 100,
      maxActualRestAgeMs: 1000,
      maxInterObservationGapMs: 500,
      observationSpanMs: 2000,
      missingRungCount: 0,
      computedAt: '2026-09-23T10:05:00.000Z',
      digestValid: overallStatus !== 'INTEGRITY_WARNING',
      inputSummary: {
        inputContractVersion: 'M3_3C_FEATURE_INPUT_V1',
        retentionPoints: [
          {
            observationId: 'obs-ret-1',
            sourceMeasurementId: 'm1',
            evidenceClass: 'REST_WAKE_VOLTAGE',
            evidenceConfidence: 'HIGH',
            stateAlignmentClass: 'ALIGNED',
            actualRestAgeMs: 3600000,
            voltageMv: 121800,
            providerObservationAt: null,
            nominalRestIntervalIndex: 1,
          },
        ],
      },
    },
    revisions: [],
    integrity: {
      digestMismatchCount: overallStatus === 'INTEGRITY_WARNING' ? 1 : 0,
      digestRowsChecked: 1,
      digestRowsUnchecked: overallStatus === 'INTEGRITY_PARTIAL' ? 2 : 0,
      digestVerificationScope: overallStatus === 'INTEGRITY_PARTIAL' ? 'BOUNDED_LATEST_WINDOW' : 'FULL',
      semanticRevisionGapCount: 0,
      duplicateSemanticRevisionCount: 0,
      canonicalSelectionStatus: 'CANONICAL_SELECTED',
      countAggregateConsistent: true,
      overallStatus,
    },
  };
}

describe('BatteryV2ShadowInspectionView (C5B)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows empty state when no vehicle selected', async () => {
    await act(async () => {
      root.render(
        createElement(BatteryV2ShadowInspectionView, {
          isDarkMode: false,
          organizations: [{ id: 'org-1', companyName: 'Acme' }],
        }),
      );
    });
    expect(container.textContent).toContain('No vehicle selected');
    expect(container.textContent?.toLowerCase()).not.toContain('repair');
  });

  it.each([
    ['OK', 'Integrity: OK'],
    ['INTEGRITY_PARTIAL', 'Integrity: INTEGRITY_PARTIAL'],
    ['INTEGRITY_WARNING', 'Integrity: INTEGRITY_WARNING'],
  ] as const)('renders %s from atomic C5A API payload', async (status, label) => {
    vi.mocked(api.admin.batteryV2.inspectRestSessionFeature).mockResolvedValue(buildInspection(status));

    await act(async () => {
      root.render(
        createElement(BatteryV2ShadowInspectionView, {
          isDarkMode: false,
          organizations: [{ id: 'org-1', companyName: 'Acme' }],
        }),
      );
    });

    const selects = container.querySelectorAll('select');
    await act(async () => {
      (selects[0] as HTMLSelectElement).value = 'org-1';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      (selects[1] as HTMLSelectElement).value = 'veh-1';
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      (selects[2] as HTMLSelectElement).value = 'sess-1';
      selects[2].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain(label);
    expect(container.textContent).toContain('121.800 V');
    expect(container.textContent).toContain('3600000');
    expect(container.textContent).toContain('obs-ret');
    expect(vi.mocked(api.admin.batteryV2.inspectRestSessionFeature)).toHaveBeenCalled();
  });

  it('loads vehicles via org-scoped operationalList when organization selected', async () => {
    vi.mocked(api.admin.batteryV2.inspectRestSessionFeature).mockResolvedValue(buildInspection('OK'));

    await act(async () => {
      root.render(
        createElement(BatteryV2ShadowInspectionView, {
          isDarkMode: false,
          organizations: [{ id: 'org-1', companyName: 'Acme' }],
        }),
      );
    });

    const selects = container.querySelectorAll('select');
    await act(async () => {
      (selects[0] as HTMLSelectElement).value = 'org-1';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(vi.mocked(api.vehicles.operationalList)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', registrationState: 'registered' }),
    );
  });
});
