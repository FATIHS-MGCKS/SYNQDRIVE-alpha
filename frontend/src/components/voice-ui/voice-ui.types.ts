import type { ReactNode } from 'react';
import type { StatusTone } from '../patterns/status-utils';

/** Shared visual tone for voice surfaces — maps to SynqDrive status tokens. */
export type VoiceSurfaceTone =
  | 'success'
  | 'watch'
  | 'warning'
  | 'degraded'
  | 'critical'
  | 'blocked'
  | 'info'
  | 'neutral'
  | 'disabled';

/** Presentation lifecycle states used by fixtures and skeletons. */
export type VoicePresentationState =
  | 'loading'
  | 'empty'
  | 'warning'
  | 'degraded'
  | 'blocked'
  | 'success'
  | 'disabled';

export function voiceSurfaceToneToStatus(tone: VoiceSurfaceTone): StatusTone {
  switch (tone) {
    case 'success':
      return 'success';
    case 'watch':
    case 'warning':
    case 'degraded':
      return 'watch';
    case 'critical':
    case 'blocked':
      return 'critical';
    case 'info':
      return 'info';
    case 'disabled':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export interface VoiceTabItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface VoiceStepItem {
  key: string;
  label: ReactNode;
  description?: ReactNode;
}

export interface VoiceDiagnosticRow {
  id: string;
  label: ReactNode;
  value?: ReactNode;
  status: 'ok' | 'warn' | 'error' | 'unknown' | 'loading';
  hint?: ReactNode;
}
