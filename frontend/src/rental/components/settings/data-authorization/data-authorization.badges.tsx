import { StatusChip } from '../../../../components/patterns';
import type { StatusTone } from '../../../../components/patterns/status-utils';
import { labelRisk, labelSourceType, labelStatus } from './data-authorization.constants';

export function AuthStatusChip({ statusKey }: { statusKey: string }) {
  const tone: StatusTone =
    statusKey === 'ACTIVE'
      ? 'success'
      : statusKey === 'PENDING'
        ? 'warning'
        : statusKey === 'REVOKED'
          ? 'critical'
          : statusKey === 'EXPIRED'
            ? 'neutral'
            : 'neutral';

  return <StatusChip tone={tone}>{labelStatus(statusKey)}</StatusChip>;
}

export function AuthRiskChip({ riskKey }: { riskKey: string }) {
  const tone: StatusTone =
    riskKey === 'CRITICAL'
      ? 'critical'
      : riskKey === 'HIGH'
        ? 'warning'
        : riskKey === 'MEDIUM'
          ? 'watch'
          : 'success';

  return <StatusChip tone={tone}>{labelRisk(riskKey)}</StatusChip>;
}

export function AuthSourceChip({ sourceType }: { sourceType: string | null }) {
  if (!sourceType) return null;
  return <StatusChip tone="info">{labelSourceType(sourceType)}</StatusChip>;
}
