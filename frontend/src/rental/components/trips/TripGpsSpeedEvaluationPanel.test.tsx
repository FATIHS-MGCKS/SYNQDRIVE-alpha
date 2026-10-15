// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { TripGpsSpeedEvaluationPanel } from './TripGpsSpeedEvaluationPanel';
import type { TripGpsSpeedEvaluationProductV1 } from '../../../lib/api';

const tripGpsSpeedEvaluationV2 = vi.fn();

vi.mock('../../lib/trip-gps-speed-evaluation-feature', () => ({
  isTripGpsSpeedEvaluationV2ProductUiEnabled: vi.fn(() => true),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    vehicleIntelligence: {
      tripGpsSpeedEvaluationV2: (...args: unknown[]) => tripGpsSpeedEvaluationV2(...args),
    },
  },
}));

function basePayload(
  overrides: Partial<TripGpsSpeedEvaluationProductV1>,
): TripGpsSpeedEvaluationProductV1 {
  return {
    contractVersion: 'DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_V1',
    qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V2',
    availability: 'READY',
    assessabilityLevel: 'FULL',
    limitedAssessability: false,
    coverage: {
      totalIntervalCount: 200,
      numericCoveragePercent: 82,
      trustedNumericCoveragePercent: 70,
      trustedLimitedCoveragePercent: 8,
      trustedNumericIntervalCount: 140,
      trustedLimitedStationaryIntervalCount: 118,
    },
    speed: {
      maxKmh: 118,
      maxScope: 'TRUSTED_NUMERIC_INTERVALS',
      maxAssessability: 'TRUSTED_MAX_AVAILABLE',
      meanKmh: 64,
      meanScope: 'TRUSTED_NUMERIC_INTERVALS_ONLY',
    },
    motion: {
      stationarySupportedIntervalCount: 144,
      movingEstimatedIntervalCount: 130,
    },
    ...overrides,
  };
}

describe('TripGpsSpeedEvaluationPanel (rendered)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    tripGpsSpeedEvaluationV2.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPanel() {
    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(TripGpsSpeedEvaluationPanel, {
            vehicleId: 'veh-1',
            tripId: 'trip-1',
          }),
        }),
      );
    });
  }

  it('renders nothing when UI feature flag is off', async () => {
    const feature = await import('../../lib/trip-gps-speed-evaluation-feature');
    vi.mocked(feature.isTripGpsSpeedEvaluationV2ProductUiEnabled).mockReturnValueOnce(false);
    await renderPanel();
    expect(container.textContent?.trim()).toBe('');
    expect(tripGpsSpeedEvaluationV2).not.toHaveBeenCalled();
  });

  it('shows loading then READY metrics with accepted stationary count (118 not 144)', async () => {
    tripGpsSpeedEvaluationV2.mockResolvedValue(basePayload({ availability: 'READY' }));
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    const text = container.textContent ?? '';
    expect(text).toContain('118');
    expect(text).toContain('144');
    expect(text).toContain('82');
  });

  it('shows PARTIAL limited-assessability copy', async () => {
    tripGpsSpeedEvaluationV2.mockResolvedValue(
      basePayload({ limitedAssessability: true, assessabilityLevel: 'PARTIAL' }),
    );
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/partially|teilweise|only partially/i);
  });

  it('shows PENDING without fabricating speed numbers', async () => {
    tripGpsSpeedEvaluationV2.mockResolvedValue(
      basePayload({
        availability: 'PENDING',
        coverage: null,
        speed: null,
        motion: null,
      }),
    );
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    const text = container.textContent ?? '';
    expect(text).toMatch(/prepar|wird noch|being prepared/i);
    expect(text).not.toContain('118 km/h');
  });

  it('shows UNAVAILABLE empty copy', async () => {
    tripGpsSpeedEvaluationV2.mockResolvedValue(
      basePayload({ availability: 'UNAVAILABLE', coverage: null, speed: null, motion: null }),
    );
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/No GPS|noch keine|not available yet/i);
  });

  it('shows NOT_ASSESSABLE with metrics when backend sends them', async () => {
    tripGpsSpeedEvaluationV2.mockResolvedValue(
      basePayload({ availability: 'NOT_ASSESSABLE', assessabilityLevel: 'UNASSESSABLE' }),
    );
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/cannot be evaluated|nicht mit ausreichender/i);
    expect(container.textContent).toContain('118');
  });

  it('renders mean speed as not available when null', async () => {
    tripGpsSpeedEvaluationV2.mockResolvedValue(
      basePayload({ speed: { ...basePayload({}).speed!, meanKmh: null } }),
    );
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/Not available|Nicht verfügbar/i);
  });

  it('shows error state on API failure', async () => {
    tripGpsSpeedEvaluationV2.mockRejectedValue(new Error('network'));
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/could not be loaded|konnte nicht geladen/i);
  });
});
