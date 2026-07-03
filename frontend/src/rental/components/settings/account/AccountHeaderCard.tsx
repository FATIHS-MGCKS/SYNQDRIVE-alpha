import { Building2, Mail, Pencil, Shield } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { StatusChip } from '../../../../components/patterns';
import { getInitials, membershipStatusLabel } from './account-utils';

interface AccountHeaderCardProps {
  account: AccountMeDto;
  onEditProfile: () => void;
}

export function AccountHeaderCard({ account, onEditProfile }: AccountHeaderCardProps) {
  const { user, organization, membership } = account;
  const initials = getInitials(user.displayName, user.email);
  const roleLabel = membership.roleLabel ?? membership.role;

  return (
    <div className="rounded-2xl border border-border/45 bg-background/40 px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-[var(--shadow-1)]"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sq-tone-brand text-sm font-semibold tracking-tight">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
              {user.displayName}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {user.email}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusChip tone="info">
                <Shield className="h-3 w-3" />
                {roleLabel}
              </StatusChip>
              <StatusChip tone="neutral">
                <Building2 className="h-3 w-3" />
                {organization.name}
              </StatusChip>
              <StatusChip tone={membershipStatusLabel(membership.status)}>
                {membership.status}
              </StatusChip>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEditProfile}
          className="w-full shrink-0 sm:w-auto"
        >
          <Pencil />
          Profil bearbeiten
        </Button>
      </div>
    </div>
  );
}
