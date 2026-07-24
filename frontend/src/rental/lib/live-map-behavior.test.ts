import { describe, expect, it } from 'vitest';
import {
  createLiveMapFollowState,
  markUserInteractionEnd,
  markUserInteractionStart,
  readPrefersReducedMotion,
  resolveCameraAnimationDuration,
  resolveEffectiveReducedMotion,
  shouldFollowCamera,
  shouldRunDeadReckoning,
} from './live-map-behavior';

describe('live-map-behavior', () => {
  it('starts with follow enabled and no user interaction', () => {
    const state = createLiveMapFollowState();
    expect(shouldFollowCamera(state, true)).toBe(true);
  });

  it('disables follow on user interaction start', () => {
    const state = createLiveMapFollowState();
    markUserInteractionStart(state);
    expect(state.followEnabled).toBe(false);
    expect(state.userInteracting).toBe(true);
    expect(shouldFollowCamera(state, true)).toBe(false);
  });

  it('keeps follow disabled after interaction ends until re-enabled externally', () => {
    const state = createLiveMapFollowState();
    markUserInteractionStart(state);
    markUserInteractionEnd(state);
    expect(state.userInteracting).toBe(false);
    expect(state.followEnabled).toBe(false);
    expect(shouldFollowCamera(state, true)).toBe(false);
  });

  it('does not follow without a target position', () => {
    const state = createLiveMapFollowState();
    expect(shouldFollowCamera(state, false)).toBe(false);
  });

  it('uses zero camera duration when reduced motion is preferred', () => {
    expect(resolveCameraAnimationDuration(true, 2000)).toBe(0);
    expect(resolveCameraAnimationDuration(false, 2000)).toBe(2000);
  });

  it('disables dead reckoning when reduced motion is preferred', () => {
    expect(shouldRunDeadReckoning(true)).toBe(false);
    expect(shouldRunDeadReckoning(false)).toBe(true);
  });

  it('prefers animation policy override for reduced motion', () => {
    expect(resolveEffectiveReducedMotion(false, { reducedMotion: true })).toBe(true);
    expect(resolveEffectiveReducedMotion(true, { reducedMotion: false })).toBe(false);
  });

  it('reads prefers-reduced-motion safely without window', () => {
    expect(readPrefersReducedMotion()).toBeTypeOf('boolean');
  });
});
