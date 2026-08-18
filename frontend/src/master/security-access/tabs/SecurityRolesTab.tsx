import { ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataCard, DataTable, StatusChip } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { MasterErrorState, MasterLoadingState } from '../../shell';
import { useOrgRoles, usePlatformRoles } from '../useSecurityAccess';
import type { OrgRoleSummaryDto, PlatformRoleSummaryDto } from '../types';
import { formatRelativeDe } from '../security-access.utils';

interface SecurityRolesTabProps {
  onOpenRole: (roleId: string, scope: 'platform' | 'organization', organizationId?: string) => void;
}

type RoleRow =
  | (PlatformRoleSummaryDto & { rowScope: 'platform' })
  | (OrgRoleSummaryDto & { rowScope: 'organization' });

export function SecurityRolesTab({ onOpenRole }: SecurityRolesTabProps) {
  const platform = usePlatformRoles();
  const [orgPage, setOrgPage] = useState(1);
  const [orgSearch, setOrgSearch] = useState('');
  const orgRoles = useOrgRoles({ page: orgPage, limit: 25, search: orgSearch || undefined });

  const rows = useMemo<RoleRow[]>(() => {
    const platformRows: RoleRow[] = platform.roles.map((r) => ({ ...r, rowScope: 'platform' as const }));
    const orgRows: RoleRow[] = (orgRoles.result?.data ?? []).map((r) => ({ ...r, rowScope: 'organization' as const }));
    return [...platformRows, ...orgRows];
  }, [platform.roles, orgRoles.result?.data]);

  const columns = useMemo<DataTableColumn<RoleRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Rollenname',
        cell: (r) => <span className="text-sm font-semibold">{r.name}</span>,
      },
      {
        key: 'scope',
        header: 'Scope',
        cell: (r) =>
          r.rowScope === 'platform' ? (
            <StatusChip tone="info" className="text-xs">
              Plattform
            </StatusChip>
          ) : (
            <span className="text-xs">Mandant: {r.organizationName}</span>
          ),
      },
      {
        key: 'users',
        header: 'Benutzer',
        cell: (r) => <span className="text-xs tabular-nums">{r.userCount}</span>,
      },
      {
        key: 'critical',
        header: 'Kritische Rechte',
        cell: (r) =>
          r.criticalCapabilities.length > 0 ? (
            <StatusChip tone="critical" icon={<ShieldAlert className="h-3 w-3" />} className="text-[10px]">
              Kritisch · {r.criticalCapabilities[0]}
            </StatusChip>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        key: 'modified',
        header: 'Zuletzt geändert',
        cell: (r) => <span className="text-xs text-muted-foreground">{formatRelativeDe(r.lastModified)}</span>,
      },
      {
        key: 'type',
        header: 'Typ',
        cell: (r) => (
          <StatusChip tone="neutral" className="text-xs">
            {r.type === 'system' ? 'System' : 'Benutzerdefiniert'}
          </StatusChip>
        ),
      },
    ],
    [],
  );

  const loading = platform.loading && orgRoles.loading && rows.length === 0;
  const error = platform.error ?? orgRoles.error;

  return (
    <div className="space-y-4">
      <DataCard flush bodyClassName="p-4">
        <input
          type="search"
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm"
          placeholder="Mandantenrollen suchen…"
          value={orgSearch}
          onChange={(e) => {
            setOrgSearch(e.target.value);
            setOrgPage(1);
          }}
        />
      </DataCard>

      {loading ? (
        <MasterLoadingState variant="rows" count={4} />
      ) : error ? (
        <MasterErrorState title="Rollen" error={error} onRetry={() => { void platform.refresh(); void orgRoles.refresh(); }} />
      ) : (
        <>
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => `${r.rowScope}-${r.id}`}
              empty="Keine Rollen gefunden"
              onRowClick={(r) =>
                onOpenRole(
                  r.id,
                  r.rowScope,
                  r.rowScope === 'organization' ? r.organizationId : undefined,
                )
              }
            />
          </div>

          <div className="space-y-2 lg:hidden">
            {rows.map((r) => (
              <button
                key={`${r.rowScope}-${r.id}`}
                type="button"
                className="w-full rounded-xl border border-border/60 bg-card p-4 text-left"
                onClick={() =>
                  onOpenRole(r.id, r.rowScope, r.rowScope === 'organization' ? r.organizationId : undefined)
                }
              >
                <p className="font-semibold text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.rowScope === 'platform' ? 'Plattform' : r.organizationName} · {r.userCount} Benutzer
                </p>
                {r.criticalCapabilities.length > 0 && (
                  <StatusChip tone="critical" icon={<ShieldAlert className="h-3 w-3" />} className="mt-2 text-[10px]">
                    Kritisch
                  </StatusChip>
                )}
              </button>
            ))}
          </div>

          {(orgRoles.result?.meta.totalPages ?? 1) > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={orgPage <= 1}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                onClick={() => setOrgPage((p) => p - 1)}
              >
                Zurück
              </button>
              <span className="text-xs text-muted-foreground">
                Mandantenrollen Seite {orgPage} / {orgRoles.result?.meta.totalPages}
              </span>
              <button
                type="button"
                disabled={orgPage >= (orgRoles.result?.meta.totalPages ?? 1)}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                onClick={() => setOrgPage((p) => p + 1)}
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
