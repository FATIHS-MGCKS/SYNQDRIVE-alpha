import { UserCog } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { countPermissionGroups } from './account-utils';
import { AccountSummaryKpiCard } from './AccountSummaryKpiCard';

interface AccountAccessCardProps {
  membership: AccountMeDto['membership'];
  organizationName: string;
  onManageUsers?: () => void;
}

export function AccountAccessCard({
  membership,
  organizationName,
  onManageUsers,
}: AccountAccessCardProps) {
  const permCount = countPermissionGroups(membership.permissions);
  const roleLabel = membership.roleLabel ?? membership.role;

  return (
    <AccountSummaryKpiCard
      label="Rolle & Zugriff"
      value={roleLabel}
      hint={`${organizationName} · ${permCount} Berechtigungsgruppe${permCount === 1 ? '' : 'n'}`}
      icon={<UserCog />}
      tone="info"
      onClick={onManageUsers}
    />
  );
}
