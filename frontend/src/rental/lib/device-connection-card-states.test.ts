import { describe, expect, it } from 'vitest';
import {
  DEVICE_CONNECTION_LABELS,
  isDeviceConnectionForbiddenError,
  isDeviceConnectionRuntimeStale,
  resolveDeviceConnectionCardState,
  shouldShowVehicleDeviceConnection,
} from './device-connection-ui';

describe('device-connection card states (Prompt 16/36)', () => {
  it('detects fleet-connectivity permission errors', () => {
    expect(isDeviceConnectionForbiddenError('Missing permission: fleet-connectivity.read')).toBe(
      true,
    );
    expect(isDeviceConnectionForbiddenError('API error 500')).toBe(false);
  });

  it('resolves loading, forbidden, error, empty, and ready states distinctly', () => {
    expect(
      resolveDeviceConnectionCardState({
        loading: true,
        forbidden: false,
        error: null,
        summary: null,
      }),
    ).toBe('loading');

    expect(
      resolveDeviceConnectionCardState({
        loading: false,
        forbidden: true,
        error: null,
        summary: null,
      }),
    ).toBe('forbidden');

    expect(
      resolveDeviceConnectionCardState({
        loading: false,
        forbidden: false,
        error: DEVICE_CONNECTION_LABELS.cardError,
        summary: null,
      }),
    ).toBe('error');

    expect(
      resolveDeviceConnectionCardState({
        loading: false,
        forbidden: false,
        error: null,
        summary: { lteR1Capable: false, recentEvents: [] } as never,
      }),
    ).toBe('empty');

    expect(
      resolveDeviceConnectionCardState({
        loading: false,
        forbidden: false,
        error: null,
        summary: { lteR1Capable: true, recentEvents: [] } as never,
      }),
    ).toBe('ready');
  });

  it('marks runtime as stale when attention is elevated or calculatedAt is old', () => {
    expect(
      isDeviceConnectionRuntimeStale({
        connectivityRuntime: {
          attentionState: 'WATCH',
          calculatedAt: new Date().toISOString(),
        },
      } as never),
    ).toBe(true);

    expect(
      isDeviceConnectionRuntimeStale({
        connectivityRuntime: {
          attentionState: 'NONE',
          calculatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        },
      } as never),
    ).toBe(true);

    expect(
      isDeviceConnectionRuntimeStale({
        connectivityRuntime: {
          attentionState: 'NONE',
          calculatedAt: new Date().toISOString(),
        },
      } as never),
    ).toBe(false);
  });

  it('shows vehicle card for LTE_R1 or when events exist', () => {
    expect(
      shouldShowVehicleDeviceConnection({
        lteR1Capable: true,
        recentEvents: [],
      } as never),
    ).toBe(true);
    expect(
      shouldShowVehicleDeviceConnection({
        lteR1Capable: false,
        recentEvents: [{ id: 'e1' }],
      } as never),
    ).toBe(true);
    expect(
      shouldShowVehicleDeviceConnection({
        lteR1Capable: false,
        recentEvents: [],
      } as never),
    ).toBe(false);
  });
});
