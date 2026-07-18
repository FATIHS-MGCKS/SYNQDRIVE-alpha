import type { VoicePhoneOnboardingStatus } from '../../../lib/api';

export function phoneOnboardingStatusTone(
  status: VoicePhoneOnboardingStatus,
): 'success' | 'watch' | 'critical' | 'neutral' | 'info' {
  switch (status) {
    case 'active':
      return 'success';
    case 'reserved':
    case 'under_review':
      return 'info';
    case 'evidence_required':
    case 'path_selected':
      return 'watch';
    case 'failed':
    case 'suspended':
      return 'critical';
    case 'not_started':
    default:
      return 'neutral';
  }
}

export function isPhoneOnboardingComplete(status: VoicePhoneOnboardingStatus): boolean {
  return status === 'active' || status === 'reserved';
}
