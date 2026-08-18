import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataCard, DataTable, StatusChip } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { MasterErrorState, MasterLoadingState } from '../../shell';
import { useSecurityUsers } from '../useSecurityAccess';
import type { GovernanceUserListItemDto } from '../types';
import {
  attentionCodeIcon,
  attentionCodeLabel,
  attentionCodeTone,
  formatRelativeDe,
  mfaStateIcon,
  mfaStateLabel,
  mfaStateTone,
} from '../security-access.utils';

export interface SecurityUsersTabProps {
  variant: 'users' | 'master-admins';
  organizationId?: string | null;
  onOpenUser: (userId: string) => void;
}

const INPUT =
  'w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring';

export function SecurityUsersTab({ variant, organizationId, onOpenUser }: SecurityUsersTabProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [mfaFilter, setMfaFilter] = useState('');

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

  const { result, loading, error, refresh } = useSecurityUsers(query);

  const columns = useMemo<DataTableColumn<GovernanceUserListItemDto>[]>(
    () => [
      {
        key: 'identity',
        header: 'Identität',
        cell: (u) => (
          <div>
            <p className="text-sm font-semibold">{u.name}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{u.email}</p>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Rolle',
        cell: (u) => (
          <span className="text-xs font-medium">
            {u.platformRole === 'MASTER_ADMIN'
              ? 'Plattform-Administrator'
              : u.platformRole === 'master-billing'
                ? 'Abrechnung (eingeschränkt)'
                : u.role}
          </span>
        ),
      },
      {
        key: 'state',
        header: 'Kontostatus',
        cell: (u) => (
          <StatusChip tone="neutral" className="text-xs">
            {u.accountState}
          </StatusChip>
        ),
      },
      {
        key: 'mfa',
        header: 'MFA',
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
        header: 'Aufmerksamkeit',
        cell: (u) =>
          u.attentionCodes.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
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
        header: 'Zuletzt aktiv',
        cell: (u) => <span className="text-xs text-muted-foreground">{formatRelativeDe(u.lastActive)}</span>,
      },
    ],
    [],
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
              placeholder="Name oder E-Mail suchen…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                window.clearTimeout((window as unknown as { _saSearch?: number })._saSearch);
                (window as unknown as { _saSearch?: number })._saSearch = window.setTimeout(() => {
                  setSearchDebounced(e.target.value);
                }, 300);
              }}
            />
          </div>
          {variant === 'master-admins' && (
            <select
              value={mfaFilter}
              onChange={(e) => {
                setMfaFilter(e.target.value);
                setPage(1);
              }}
              className={INPUT}
            >
              <option value="">Alle MFA-Status</option>
              <option value="DISABLED">MFA fehlt</option>
              <option value="ENABLED">MFA aktiv</option>
              <option value="REQUIRED">MFA erforderlich</option>
            </select>
          )}
          <button type="button" className="sq-btn-secondary rounded-xl px-4 py-2 text-xs font-semibold" onClick={() => void refresh()}>
            Aktualisieren
          </button>
        </div>
      </DataCard>

      {loading && !result ? (
        <MasterLoadingState variant="rows" count={5} />
      ) : error ? (
        <MasterErrorState title="Benutzerliste" error={error} onRetry={() => void refresh()} />
      ) : (
        <>
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={result?.data ?? []}
              getRowKey={(u) => u.id}
              empty="Keine Benutzer gefunden"
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
                Zurück
              </button>
              <span className="text-xs text-muted-foreground">
                Seite {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                Weiter
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
