/**
 * SynqDrive — Context window builder (pure).
 *
 * Native DIMO behavior events use a symmetric ±30s window around the anchor.
 */
import type { AnchorType } from './event-context.types';

export const BEHAVIOR_WINDOW_PRE_MS = 30_000;
export const BEHAVIOR_WINDOW_POST_MS = 30_000;

export interface ContextWindow {
  windowStart: Date;
  windowEnd: Date;
}

export function buildContextWindow(
  _anchorType: AnchorType,
  anchorTimestamp: Date,
): ContextWindow {
  const anchorMs = anchorTimestamp.getTime();
  return {
    windowStart: new Date(anchorMs - BEHAVIOR_WINDOW_PRE_MS),
    windowEnd: new Date(anchorMs + BEHAVIOR_WINDOW_POST_MS),
  };
}
