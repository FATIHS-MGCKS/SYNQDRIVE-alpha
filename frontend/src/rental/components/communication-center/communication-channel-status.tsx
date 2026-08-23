import { StatusChip } from '../../../components/patterns';
import type { CommunicationSettingsStatusKind } from './communication-settings-status';

export function communicationStatusTone(
  status: CommunicationSettingsStatusKind,
): 'success' | 'watch' | 'critical' | 'info' {
  if (status === 'CONNECTED' || status === 'CONFIGURED') return 'success';
  if (status === 'DEGRADED') return 'critical';
  if (status === 'DISABLED') return 'info';
  return 'watch';
}

interface CommunicationChannelStatusChipProps {
  status: CommunicationSettingsStatusKind;
  label: string;
}

export function CommunicationChannelStatusChip({
  status,
  label,
}: CommunicationChannelStatusChipProps) {
  return (
    <StatusChip tone={communicationStatusTone(status)} aria-label={label}>
      {label}
    </StatusChip>
  );
}
