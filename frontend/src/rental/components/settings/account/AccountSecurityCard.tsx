import { Bell, MonitorSmartphone } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { countActiveNotificationCategories, countCriticalNotificationChannels } from './account-utils';
import { AccountSummaryKpiCard } from './AccountSummaryKpiCard';
import type { AccountKpiTone } from './account-ui';

interface AccountNotificationsSummaryCardProps {
  notifications: AccountMeDto['notifications'];
  onAdjust?: () => void;
}

export function AccountNotificationsSummaryCard({
  notifications,
  onAdjust,
}: AccountNotificationsSummaryCardProps) {
  const activeCategories = countActiveNotificationCategories(notifications);
  const critical = countCriticalNotificationChannels(notifications);

  return (
    <AccountSummaryKpiCard
      label="Benachrichtigungen"
      value={String(activeCategories)}
      hint={`von ${notifications.length} Kategorien aktiv · ${critical} nur kritisch`}
      icon={<Bell />}
      tone="neutral"
      onClick={onAdjust}
    />
  );
}

interface AccountSecuritySummaryCardProps {
  security: AccountMeDto['security'];
  onManage?: () => void;
}

export function AccountSecuritySummaryCard({ security, onManage }: AccountSecuritySummaryCardProps) {
  const twoFaLabel = security.twoFactorEnabled
    ? '2FA aktiv'
    : security.twoFactorAvailable
      ? '2FA nicht aktiv'
      : '2FA demnächst';

  const tone: AccountKpiTone =
    security.securityScore >= 80 ? 'success' : security.securityScore < 50 ? 'watch' : 'neutral';

  return (
    <AccountSummaryKpiCard
      label="Sicherheit"
      value={`${security.securityScore}%`}
      hint={`${security.activeSessionCount} Sitzung(en) · ${twoFaLabel}`}
      icon={<MonitorSmartphone />}
      tone={tone}
      onClick={onManage}
    />
  );
}
