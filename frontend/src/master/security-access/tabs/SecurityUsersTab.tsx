import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataCard, DataTable, StatusChip } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { MasterErrorState, MasterLoadingState } from '../../shell';
import { useSecurityUsers } from '../useSecurityAccess';
import type { GovernanceUserListItemDto } from '../types';
import { useDebouncedValue } from '../useDebouncedValue';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';
import {
  attentionCodeIcon,
  attentionCodeTone,
  mfaStateIcon,
  mfaStateTone,
} from '../security-access.utils';

export interface SecurityUsersTabProps {
  variant: 'users' | 'master-admins';
  organizationId?: string | null;
  onOpenUser: (userId: string) => void;
  onCreateUser?: () => void;
}

const INPUT =
  'w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

export function SecurityUsersTab({ variant, organizationId, onOpenUser, onCreateUser }: SecurityUsersTabProps) {
  const { t, locale, mfaStateLabel, attentionCodeLabel, accountStateLabel, platformRoleLabel, formatRelative, loadError } =
    useSecurityAccessPresentation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const searchDebounced = useDebouncedValue(search, 300);
  const [mfaFilter, setMfaFilter] = useState('');

  useEffect(() => {
    setPage(1);
  }, [searchDebounced, mfaFilter, organizationId, variant]);

  const query = useMemo(
    () => ({
      page,
      limit: 25,
      search: searchDebounced || undefined,
      platformRole: variant === 'master-admins' ? 'MASTER_ADMIN' : undefined,
      mfaState: mfaFilter || undefined,
      organizationId: organizationId ?? undefined,
      attention: variant === 'master-admins' && !mfaFilter ? undefined : undefined,
    }),
    [page, searchDebounced, variant, mfaFilter, organizationId],
  );

  const { result, loading, error, refresh } = useSecurityUsers(query, true, loadError);

  const columns = useMemo<DataTableColumn<GovernanceUserListItemDto>[]>(
    () => [
      {
        key: 'identity',
        header: t('master.securityAccess.users.columns.identity'),
        cell: (u) => (
          <div>
            <p className="text-sm font-semibold">{u.name}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{u.email}</p>
          </div>
        ),
      },
      {
        key: 'role',
        header: t('master.securityAccess.users.columns.role'),
        cell: (u) => (
          <span className="text-xs font-medium">
            {u.platformRole ? platformRoleLabel(u.platformRole) : u.role}
          </span>
        ),
      },
      {
        key: 'state',
        header: t('master.securityAccess.users.columns.accountState'),
        cell: (u) => (
          <StatusChip tone="neutral" className="text-xs">
            {accountStateLabel(u.accountState)}
          </StatusChip>
        ),
      },
      {
        key: 'mfa',
        header: t('master.securityAccess.users.columns.mfa'),
        cell: (u) => {
          const Icon = mfaStateIcon(u.mfaState);
          return (
            <StatusChip tone={mfaStateTone(u.mfaState)} icon={<Icon className="h-3 w-3" />} className="text-xs">
              {mfaStateLabel(u.mfaState)}
            </StatusChip>
          );
        },
      },
      {
        key: 'attention',
        header: t('master.securityAccess.users.columns.attention'),
        cell: (u) =>
          u.attentionCodes.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t('master.securityAccess.common.emDash')}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {u.attentionCodes.slice(0, 2).map((code) => {
                const Icon = attentionCodeIcon(code);
                return (
                  <StatusChip key={code} tone={attentionCodeTone(code)} icon={<Icon className="h-3 w-3" />} className="text-[10px]">
                    {attentionCodeLabel(code)}
                  </StatusChip>
                );
              })}
              {u.attentionCodes.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{u.attentionCodes.length - 2}</span>
              )}
            </div>
          ),
      },
      {
        key: 'last',
        header: t('master.securityAccess.users.columns.lastActive'),
        cell: (u) => <span className="text-xs text-muted-foreground">{formatRelative(u.lastActive)}</span>,
      },
    ],
    [accountStateLabel, attentionCodeLabel, formatRelative, locale, mfaStateLabel, platformRoleLabel, t],
  );

  const totalPages = result?.meta.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <DataCard flush bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              className={`${INPUT} pl-9`}
              placeholder={t('master.securityAccess.users.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {variant === 'master-admins' && (
            <select
              value={mfaFilter}
              onChange={(e) => setMfaFilter(e.target.value)}
              className={INPUT}
            >
              <option value="">{t('master.securityAccess.users.mfaFilterAll')}</option>
              <option value="DISABLED">{t('master.securityAccess.users.mfaFilterMissing')}</option>
              <option value="ENABLED">{t('master.securityAccess.users.mfaFilterActive')}</option>
              <option value="REQUIRED">{t('master.securityAccess.users.mfaFilterRequired')}</option>
            </select>
          )}
          {variant === 'users' && onCreateUser && (
            <button
              type="button"
              className="sq-btn-primary rounded-xl px-4 py-2 text-xs font-semibold"
              data-testid="security-users-create"
              onClick={onCreateUser}
            >
              {t('master.securityAccess.users.createUser')}
            </button>
          )}
          <button type="button" className="sq-btn-secondary rounded-xl px-4 py-2 text-xs font-semibold" onClick={() => void refresh()}>
            {t('master.securityAccess.users.refresh')}
          </button>
        </div>
      </DataCard>

      {loading && !result ? (
        <MasterLoadingState variant="rows" count={5} />
      ) : error ? (
        <MasterErrorState title={t('master.securityAccess.users.errorTitle')} error={error} onRetry={() => void refresh()} />
      ) : (
        <>
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={result?.data ?? []}
              getRowKey={(u) => u.id}
              empty={t('master.securityAccess.users.empty')}
              onRowClick={(u) => onOpenUser(u.id)}
            />
          </div>

          <div className="space-y-2 lg:hidden">
            {(result?.data ?? []).map((u) => {
              const MfaIcon = mfaStateIcon(u.mfaState);
              return (
                <button
                  key={u.id}
                  type="button"
                  className="w-full rounded-xl border border-border/60 bg-card p-4 text-left hover:bg-muted/20"
                  onClick={() => onOpenUser(u.id)}
                >
                  <p className="font-semibold text-sm">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusChip tone={mfaStateTone(u.mfaState)} icon={<MfaIcon className="h-3 w-3" />} className="text-[10px]">
                      {mfaStateLabel(u.mfaState)}
                    </StatusChip>
                    {u.attentionCodes.slice(0, 1).map((code) => {
                      const Icon = attentionCodeIcon(code);
                      return (
                        <StatusChip key={code} tone={attentionCodeTone(code)} icon={<Icon className="h-3 w-3" />} className="text-[10px]">
                          {attentionCodeLabel(code)}
                        </StatusChip>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('master.securityAccess.pagination.back')}
              </button>
              <span className="text-xs text-muted-foreground">
                {t('master.securityAccess.pagination.pageOf', { page: String(page), total: String(totalPages) })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                {t('master.securityAccess.pagination.forward')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}