// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import { renderHook, waitForHook } from '../../../test/renderHook';
import {
  invalidateBatteryHealthQueries,
  resetBatteryHealthCache,
  resetBatteryHealthReloadHandlers,
} from './index';
import { useBatteryHealthQuery } from './useBatteryHealthQuery';

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      vehicleIntelligence: {
        ...actual.api.vehicleIntelligence,
        batteryHealthSummary: vi.fn(),
        batteryHealthDetail: vi.fn(),
      },
    },
  };
});

function summaryFixture(id: string) {
  return {
    canonical: { id },
    lv: {
      publicationState: 'STABLE',
      telemetry: { voltageV: 12.4 },
    },
    currentTelemetry: { lvVoltageV: 12.4 },
  };
}

describe('useBatteryHealthQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resetBatteryHealthCache();
    resetBatteryHealthReloadHandlers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads summary data and shares cache across hook instances', async () => {
    vi.mocked(api.vehicleIntelligence.batteryHealthSummary).mockResolvedValue(
      summaryFixture('shared') as never,
    );

    const first = renderHook(() =>
      useBatteryHealthQuery({
        orgId: 'org-a',
        vehicleId: 'veh-1',
        variant: 'summary',
      }),
    );

    await waitForHook(() => first.result.current.data?.canonical?.id === 'shared');
    expect(api.vehicleIntelligence.batteryHealthSummary).toHaveBeenCalledTimes(1);

    const second = renderHook(() =>
      useBatteryHealthQuery({
        orgId: 'org-a',
        vehicleId: 'veh-1',
        variant: 'summary',
      }),
    );

    expect(second.result.current.data?.canonical?.id).toBe('shared');
    expect(api.vehicleIntelligence.batteryHealthSummary).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });

  it('surfaces fetch errors without discarding prior data', async () => {
    vi.mocked(api.vehicleIntelligence.batteryHealthSummary)
      .mockResolvedValueOnce(summaryFixture('stable') as never)
      .mockRejectedValueOnce(new Error('provider timeout'));

    const { result, unmount } = renderHook(() =>
      useBatteryHealthQuery({
        orgId: 'org-a',
        vehicleId: 'veh-1',
        variant: 'summary',
      }),
    );

    await waitForHook(() => result.current.data?.canonical?.id === 'stable');
    await result.current.reload('all');
    await waitForHook(() => result.current.error === 'provider timeout');

    expect(result.current.data?.canonical?.id).toBe('stable');
    expect(result.current.loading).toBe(false);

    unmount();
  });

  it('retries after an error', async () => {
    vi.mocked(api.vehicleIntelligence.batteryHealthSummary)
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(summaryFixture('recovered') as never);

    const { result, unmount } = renderHook(() =>
      useBatteryHealthQuery({
        orgId: 'org-a',
        vehicleId: 'veh-1',
        variant: 'summary',
      }),
    );

    await waitForHook(() => result.current.error === 'temporary outage');
    await result.current.retry();
    await waitForHook(() => result.current.data?.canonical?.id === 'recovered');
    expect(result.current.error).toBeNull();

    unmount();
  });

  it('merges live polling reloads without replacing publication state', async () => {
    vi.mocked(api.vehicleIntelligence.batteryHealthSummary)
      .mockResolvedValueOnce(
        summaryFixture('initial') as never,
      )
      .mockResolvedValueOnce({
        ...summaryFixture('polled'),
        lv: {
          publicationState: 'STABILIZING',
          telemetry: { voltageV: 13.8 },
        },
        currentTelemetry: { lvVoltageV: 13.8 },
      } as never);

    const { result, unmount } = renderHook(() =>
      useBatteryHealthQuery({
        orgId: 'org-a',
        vehicleId: 'veh-1',
        variant: 'summary',
        livePolling: true,
      }),
    );

    await waitForHook(() => result.current.data?.canonical?.id === 'initial');
    expect(api.vehicleIntelligence.batteryHealthSummary).toHaveBeenCalledTimes(1);

    await result.current.reload('live');
    await waitForHook(() => result.current.data?.lv?.telemetry?.voltageV === 13.8);

    expect(result.current.data?.lv?.telemetry?.voltageV).toBe(13.8);
    expect(result.current.data?.lv?.publicationState).toBe('STABLE');
    expect(api.vehicleIntelligence.batteryHealthSummary).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('reloads health data after targeted invalidation', async () => {
    vi.mocked(api.vehicleIntelligence.batteryHealthDetail)
      .mockResolvedValueOnce({ canonical: { id: 'detail-v1' } } as never)
      .mockResolvedValueOnce({ canonical: { id: 'detail-v2' } } as never)
      .mockResolvedValueOnce({ canonical: { id: 'detail-v2' } } as never);

    const { result, unmount } = renderHook(() =>
      useBatteryHealthQuery({
        orgId: 'org-a',
        vehicleId: 'veh-1',
        variant: 'detail',
      }),
    );

    await waitForHook(() => result.current.data?.canonical?.id === 'detail-v1');

    invalidateBatteryHealthQueries({
      orgId: 'org-a',
      vehicleId: 'veh-1',
      reason: 'evidence-added',
      scopes: ['health', 'detail'],
    });

    await waitForHook(() => result.current.data?.canonical?.id === 'detail-v2', 5000);
    expect(api.vehicleIntelligence.batteryHealthDetail).toHaveBeenCalled();

    unmount();
  });
});
