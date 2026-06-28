/**
 * SynqDrive — Context window builder (pure).
 *
 * Defines the time window fetched around an anchor. Behavior events use a
 * symmetric ±30s window; RPM webhook candidates use an asymmetric window with a
 * longer post-anchor tail (default +90s) so a sustained high-RPM/rev pattern can
 * be observed after the trigger. Post-tail is configurable for future tuning.
 */
import type { AnchorType } from './event-context.types';

export const BEHAVIOR_WINDOW_PRE_MS = 30_000;
export const BEHAVIOR_WINDOW_POST_MS = 30_000;
export const RPM_CANDIDATE_WINDOW_PRE_MS = 30_000;
export const RPM_CANDIDATE_WINDOW_POST_DEFAULT_S = 90;

export interface ContextWindowOptions {
  /** Post-anchor tail for RPM webhook candidates (seconds). Default 90. */
  rpmCandidatePostSeconds?: number;
}

export interface ContextWindow {
  windowStart: Date;
  windowEnd: Date;
}

export function buildContextWindow(
  anchorType: AnchorType,
  anchorTimestamp: Date,
  options?: ContextWindowOptions,
): ContextWindow {
  const anchorMs = anchorTimestamp.getTime();

  if (anchorType === 'RPM_WEBHOOK_CANDIDATE') {
    const postS = options?.rpmCandidatePostSeconds ?? RPM_CANDIDATE_WINDOW_POST_DEFAULT_S;
    return {
      windowStart: new Date(anchorMs - RPM_CANDIDATE_WINDOW_PRE_MS),
      windowEnd: new Date(anchorMs + postS * 1_000),
    };
  }

  // DIMO_NATIVE_BEHAVIOR_EVENT (and any future symmetric anchor)
  return {
    windowStart: new Date(anchorMs - BEHAVIOR_WINDOW_PRE_MS),
    windowEnd: new Date(anchorMs + BEHAVIOR_WINDOW_POST_MS),
  };
}
