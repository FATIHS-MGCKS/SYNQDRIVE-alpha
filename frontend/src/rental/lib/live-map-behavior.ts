/**
 * Follow-mode, reduced-motion, and camera policy for the vehicle detail live map.
 */

export type LiveMapFollowState = {
  /** When false, camera updates from telemetry are paused until re-enabled. */
  followEnabled: boolean;
  /** True while the user is actively dragging / zooming / rotating / pitching. */
  userInteracting: boolean;
};

export function createLiveMapFollowState(): LiveMapFollowState {
  return { followEnabled: true, userInteracting: false };
}

/** Disable follow when the user manually moves the map. */
export function disableFollowOnUserInteraction(state: LiveMapFollowState): void {
  state.followEnabled = false;
}

export function markUserInteractionStart(state: LiveMapFollowState): void {
  state.userInteracting = true;
  state.followEnabled = false;
}

export function markUserInteractionEnd(state: LiveMapFollowState): void {
  state.userInteracting = false;
}

export function shouldFollowCamera(
  state: LiveMapFollowState,
  hasTargetPosition: boolean,
): boolean {
  return hasTargetPosition && state.followEnabled && !state.userInteracting;
}

export function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Camera ease duration: instant when reduced motion is preferred. */
export function resolveCameraAnimationDuration(
  reducedMotion: boolean,
  defaultMs = 900,
): number {
  return reducedMotion ? 0 : defaultMs;
}

/** Dead reckoning is disabled when reduced motion is preferred. */
export function shouldRunDeadReckoning(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

export function resolveEffectiveReducedMotion(
  prefersReducedMotion: boolean,
  animationPolicy?: { reducedMotion?: boolean },
): boolean {
  return Boolean(animationPolicy?.reducedMotion ?? prefersReducedMotion);
}
