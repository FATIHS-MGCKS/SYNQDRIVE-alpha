import { ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataCard, DataTable, StatusChip } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { MasterErrorState, MasterLoadingState } from '../../shell';
import { useOrgRoles, usePlatformRoles } from '../useSecurityAccess';
import type { OrgRoleSummaryDto, PlatformRoleSummaryDto } from '../types';
import { useDebouncedValue } from '../useDebouncedValue';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';

interface SecurityRolesTabProps {
  onOpenRole: (roleId: string, scope: 'platform' | 'organization', organizationId?: string) => void;
}

type RoleRow =
  | (PlatformRoleSummaryDto & { rowScope: 'platform' })
  | (OrgRoleSummaryDto & { rowScope: 'organization' });

export function SecurityRolesTab({ onOpenRole }: SecurityRolesTabProps) {
  const { t, formatRelative, loadError } = useSecurityAccessPresentation();
  const platform = usePlatformRoles(loadError);
  const [orgPage, setOrgPage] = useState(1);
  const [orgSearch, setOrgSearch] = useState('');
  const orgSearchDebounced = useDebouncedValue(orgSearch, 300);
  const orgRoles = useOrgRoles({ page: orgPage, limit: 25, search: orgSearchDebounced || undefined }, loadError);

  useEffect(() => {
    setOrgPage(1);
  }, [orgSearchDebounced]);

  const rows = useMemo<RoleRow[]>(() => {
    const platformRows: RoleRow[] = platform.roles.map((r) => ({ ...r, rowScope: 'platform' as const }));
    const orgRows: RoleRow[] = (orgRoles.result?.data ?? []).map((r) => ({ ...r, rowScope: 'organization' as const }));
    return [...platformRows, ...orgRows];
  }, [platform.roles, orgRoles.result?.data]);

  const columns = useMemo<DataTableColumn<RoleRow>[]>(
    () => [
      {
        key: 'name',
        header: t('master.securityAccess.roles.columns.roleName'),
        cell: (r) => <span className="text-sm font-semibold">{r.name}</span>,
      },
      {
        key: 'scope',
        header: t('master.securityAccess.roles.columns.scope'),
        cell: (r) =>
          r.rowScope === 'platform' ? (
            <StatusChip tone="info" className="text-xs">
              {t('master.securityAccess.common.platform')}
            </StatusChip>
          ) : (
            <span className="text-xs">{t('master.securityAccess.roles.scopeTenant', { name: r.organizationName })}</span>
          ),
      },
      {
        key: 'users',
        header: t('master.securityAccess.roles.columns.users'),
        cell: (r) => <span className="text-xs tabular-nums">{r.userCount}</span>,
      },
      {
        key: 'critical',
        header: t('master.securityAccess.roles.columns.criticalRights'),
        cell: (r) =>
          r.criticalCapabilities.length > 0 ? (
            <StatusChip tone="critical" icon={<ShieldAlert className="h-3 w-3" />} className="text-[10px]">
              {t('master.securityAccess.roles.criticalWithCapability', { capability: r.criticalCapabilities[0] })}
            </StatusChip>
          ) : (
            <span className="text-xs text-muted-foreground">{t('master.securityAccess.common.emDash')}</span>
          ),
      },
      {
        key: 'modified',
        header: t('master.securityAccess.roles.columns.lastModified'),
        cell: (r) => <span className="text-xs text-muted-foreground">{formatRelative(r.lastModified)}</span>,
      },
      {
        key: 'type',
        header: t('master.securityAccess.roles.columns.type'),
        cell: (r) => (
          <StatusChip tone="neutral" className="text-xs">
            {r.type === 'system' ? t('master.securityAccess.roles.typeSystem') : t('master.securityAccess.roles.typeCustom')}
          </StatusChip>
        ),
      },
    ],
    [formatRelative, t],
  );

  const loading = platform.loading && orgRoles.loading && rows.length === 0;
  const error = platform.error ?? orgRoles.error;

  return (
    <div className="space-y-4">
      <DataCard flush bodyClassName="p-4">
        <input
          type="search"
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm"
          placeholder={t('master.securityAccess.roles.searchOrgPlaceholder')}
          value={orgSearch}
          onChange={(e) => setOrgSearch(e.target.value)}
        />
      </DataCard>

      {loading ? (
        <MasterLoadingState variant="rows" count={4} />
      ) : error ? (
        <MasterErrorState title={t('master.securityAccess.roles.errorTitle')} error={error} onRetry={() => { void platform.refresh(); void orgRoles.refresh(); }} />
      ) : (
        <>
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => `${r.rowScope}-${r.id}`}
              empty={t('master.securityAccess.roles.empty')}
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
                  {t('master.securityAccess.roles.mobileUsersCount', {
                    scope: r.rowScope === 'platform' ? t('master.securityAccess.common.platform') : r.organizationName,
                    count: String(r.userCount),
                  })}
                </p>
                {r.criticalCapabilities.length > 0 && (
                  <StatusChip tone="critical" icon={<ShieldAlert className="h-3 w-3" />} className="mt-2 text-[10px]">
                    {t('master.securityAccess.common.critical')}
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
                {t('master.securityAccess.pagination.back')}
              </button>
              <span className="text-xs text-muted-foreground">
                {t('master.securityAccess.roles.orgPageOf', {
                  page: String(orgPage),
                  total: String(orgRoles.result?.meta.totalPages ?? 1),
                })}
              </span>
              <button
                type="button"
                disabled={orgPage >= (orgRoles.result?.meta.totalPages ?? 1)}
                className="sq-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                onClick={() => setOrgPage((p) => p + 1)}
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