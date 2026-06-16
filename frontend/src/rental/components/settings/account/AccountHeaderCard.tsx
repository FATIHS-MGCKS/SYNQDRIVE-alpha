import { Building2, Mail, Pencil, Shield } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
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
    <div className="sq-card rounded-2xl p-5 shadow-[var(--shadow-1)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="w-16 h-16 rounded-2xl object-cover shadow-[var(--shadow-1)] shrink-0"
            />
          ) : (
            <div className="w-16 h-16 sq-tone-brand rounded-2xl flex items-center justify-center text-lg font-semibold tracking-tight shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground truncate">
              {user.displayName}
            </h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              {user.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusChip tone="info">
                <Shield className="w-3 h-3" />
                {roleLabel}
              </StatusChip>
              <StatusChip tone="neutral">
                <Building2 className="w-3 h-3" />
                {organization.name}
              </StatusChip>
              <StatusChip tone={membershipStatusLabel(membership.status)}>
                {membership.status}
              </StatusChip>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onEditProfile}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] transition-all active:scale-[0.98] shrink-0"
        >
          <Pencil className="w-4 h-4" />
          Profil bearbeiten
        </button>
      </div>
    </div>
  );
}
