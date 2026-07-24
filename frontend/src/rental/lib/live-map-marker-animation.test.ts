import { describe, expect, it, vi } from 'vitest';
import {
  GPS_INTERP_DURATION_MS,
  DR_MAX_PREDICT_S,
  computeMarkerAnimationFrame,
  deadReckon,
  projectLngLatToScreen,
  shouldSnapMarkerMove,
  startMarkerAnimation,
} from './live-map-marker-animation';

describe('live-map-marker-animation', () => {
  it('snaps tiny moves and teleports', () => {
    expect(shouldSnapMarkerMove([9.4, 51.1], [9.400001, 51.100001])).toBe(true);
    expect(shouldSnapMarkerMove([9.4, 51.1], [12, 54])).toBe(true);
    expect(shouldSnapMarkerMove([9.4, 51.1], [9.41, 51.11])).toBe(false);
  });

  it('interpolates during GPS phase', () => {
    const mid = computeMarkerAnimationFrame({
      from: [9.4, 51.1],
      to: [9.41, 51.11],
      heading: 90,
      speedKmh: 40,
      elapsedMs: GPS_INTERP_DURATION_MS / 2,
    });
    expect(mid.phase).toBe('interp');
    expect(mid.position[0]).toBeGreaterThan(9.4);
    expect(mid.position[0]).toBeLessThan(9.41);
  });

  it('dead-reckons after interpolation when speed is sufficient', () => {
    const dr = computeMarkerAnimationFrame({
      from: [9.4, 51.1],
      to: [9.41, 51.11],
      heading: 90,
      speedKmh: 40,
      elapsedMs: GPS_INTERP_DURATION_MS + 1000,
    });
    expect(dr.phase).toBe('dead_reckon');
    expect(dr.position[0]).not.toBe(9.41);
  });

  it('finishes after max dead-reckon window', () => {
    const done = computeMarkerAnimationFrame({
      from: [9.4, 51.1],
      to: [9.41, 51.11],
      heading: 90,
      speedKmh: 40,
      elapsedMs: GPS_INTERP_DURATION_MS + DR_MAX_PREDICT_S * 1000 + 1,
    });
    expect(done.phase).toBe('done');
    expect(done.position).toEqual([9.41, 51.11]);
  });

  it('snaps immediately when reducedMotion is enabled', () => {
    const frame = computeMarkerAnimationFrame({
      from: [9.4, 51.1],
      to: [9.41, 51.11],
      heading: 90,
      speedKmh: 40,
      elapsedMs: 100,
      reducedMotion: true,
    });
    expect(frame.phase).toBe('done');
    expect(frame.position).toEqual([9.41, 51.11]);
  });

  it('projects plate overlay transform without React', () => {
    const transform = projectLngLatToScreen(
      () => ({ x: 120, y: 240 }),
      [9.4, 51.1],
    );
    expect(transform).toBe('translate(120px, 220px) translate(-50%, -100%)');
  });

  it('deadReckon moves position along heading', () => {
    const next = deadReckon([9.4, 51.1], 90, 36, 1);
    expect(next[0]).toBeGreaterThan(9.4);
    expect(next[1]).toBeCloseTo(51.1, 3);
  });

  it('cancels in-flight animation when a new session starts', () => {
    const frames: number[] = [];
    let now = 0;
    const requestFrame = vi.fn((cb: FrameRequestCallback) => {
      frames.push(now);
      return frames.length;
    });
    const cancelFrame = vi.fn();

    const first = startMarkerAnimation({
      from: [9.4, 51.1],
      to: [9.41, 51.11],
      heading: 90,
      speedKmh: 40,
      requestFrame,
      cancelFrame,
      now: () => now,
      onFrame: () => {},
    });

    now = 500;
    requestFrame.mock.calls[0]?.[0](0);
    first.cancel();

    const onFrame = vi.fn();
    startMarkerAnimation({
      from: [9.4, 51.1],
      to: [9.42, 51.12],
      heading: 90,
      speedKmh: 40,
      requestFrame,
      cancelFrame,
      now: () => now,
      onFrame,
    });

    expect(cancelFrame).toHaveBeenCalled();
    expect(onFrame).toHaveBeenCalled();
  });

  it('stops scheduling when animation reaches done phase', () => {
    let now = 0;
    const requestFrame = vi.fn(() => 1);
    const cancelFrame = vi.fn();

    startMarkerAnimation({
      from: [9.4, 51.1],
      to: [9.41, 51.11],
      heading: 90,
      speedKmh: 40,
      requestFrame,
      cancelFrame,
      now: () => now,
      onFrame: () => {},
    });

    now = GPS_INTERP_DURATION_MS + DR_MAX_PREDICT_S * 1000 + 100;
    const tick = requestFrame.mock.calls[0]?.[0] as FrameRequestCallback;
    tick(0);
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  it('ignores stale frames after cancel', () => {
    const requestFrame = vi.fn((cb: FrameRequestCallback) => {
      queueMicrotask(() => cb(0));
      return 1;
    });
    const cancelFrame = vi.fn();
    const onFrame = vi.fn();
    let now = 0;

    const session = startMarkerAnimation({
      from: [9.4, 51.1],
      to: [9.41, 51.11],
      heading: 90,
      speedKmh: 40,
      requestFrame,
      cancelFrame,
      now: () => now,
      onFrame,
    });

    session.cancel();
    now = 1000;
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(onFrame).not.toHaveBeenCalled();
        resolve();
      });
    });
  });
});
