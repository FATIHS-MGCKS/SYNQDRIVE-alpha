import type { OrgEmailSettingsDto } from '../../../lib/api';
import type { CommunicationSettingsStatusKind } from './communication-settings-status';

export function resolveEmailSettingsStatus(
  settings: OrgEmailSettingsDto | null | undefined,
): CommunicationSettingsStatusKind {
  if (!settings) return 'NOT_CONFIGURED';
  if (settings.mode === 'SYNQDRIVE_DEFAULT') return 'CONFIGURED';
  if (settings.replyToEmail?.trim() || settings.defaultFromName?.trim()) {
    return 'CONFIGURED';
  }
  return 'NOT_CONFIGURED';
}
