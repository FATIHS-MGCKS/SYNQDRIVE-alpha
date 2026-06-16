import { KeyRound, MapPin, UserCog } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { countPermissionGroups } from './account-utils';

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
    <div className="sq-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">Rolle & Zugriff</span>
        <UserCog className="w-4 h-4 text-muted-foreground/80" />
      </div>
      <p className="mt-2 text-[18px] font-semibold text-foreground truncate">{roleLabel}</p>
      <p className="text-[12px] text-muted-foreground truncate">{organizationName}</p>
      <div className="mt-auto pt-3 border-t border-border/50 space-y-2 text-[10px] text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <KeyRound className="w-3 h-3" />
          {permCount} Berechtigungsgruppe{permCount === 1 ? '' : 'n'}
        </p>
        {membership.stationScope && (
          <p className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            Station Scope: {membership.stationScope}
          </p>
        )}
        <p className="leading-snug">
          Bearbeitung unter{' '}
          {onManageUsers ? (
            <button
              type="button"
              onClick={onManageUsers}
              className="font-semibold text-[var(--brand)] hover:underline"
            >
              Benutzer & Rollen
            </button>
          ) : (
            'Benutzer & Rollen'
          )}
        </p>
      </div>
    </div>
  );
}
