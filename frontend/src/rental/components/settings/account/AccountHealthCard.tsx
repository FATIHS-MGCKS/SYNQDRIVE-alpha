import { Activity } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { AccountSummaryKpiCard } from './AccountSummaryKpiCard';
import type { AccountKpiTone } from './account-ui';

interface AccountHealthCardProps {
  accountHealth: AccountMeDto['accountHealth'];
  onImprove?: () => void;
}

export function AccountHealthCard({ accountHealth, onImprove }: AccountHealthCardProps) {
  const missing = accountHealth.missingItems.length;
  const tone: AccountKpiTone =
    accountHealth.score >= 80 && missing === 0
      ? 'success'
      : missing > 0
        ? 'watch'
        : 'neutral';

  return (
    <AccountSummaryKpiCard
      label="Account Health"
      value={`${accountHealth.score}%`}
      hint={
        missing > 0
          ? `${missing} offen · Profil vervollständigen`
          : 'Alle Kernpunkte erfüllt'
      }
      icon={<Activity />}
      tone={tone}
      onClick={missing > 0 ? onImprove : undefined}
    />
  );
}
