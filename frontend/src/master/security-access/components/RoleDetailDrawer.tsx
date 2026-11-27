import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { StatusChip } from '../../../components/patterns';
import { SkeletonCard } from '../../../components/patterns/states';
import { useRoleDetail } from '../useSecurityAccess';
import type { RoleScope } from '../types';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';

interface RoleDetailDrawerProps {
  roleId: string | null;
  roleScope: RoleScope | null;
  organizationId?: string | null;
  onClose: () => void;
}

export function RoleDetailDrawer({ roleId, roleScope, organizationId, onClose }: RoleDetailDrawerProps) {
  const { t, formatRelative } = useSecurityAccessPresentation();
  const { detail, loading } = useRoleDetail(roleId, roleScope, organizationId);
  const boundDetail =
    detail && roleId && roleScope && detail.id === roleId && detail.scope === roleScope ? detail : null;

  const criticalCaps = useMemo(() => boundDetail?.criticalCapabilities ?? [], [boundDetail]);

  const eyebrow =
    roleScope === 'platform'
      ? t('master.securityAccess.roleDetail.eyebrowPlatform')
      : t('master.securityAccess.roleDetail.eyebrowOrg');

  return (
    <DetailDrawer
      open={!!roleId && !!roleScope}
      onOpenChange={(open) => !open && onClose()}
      eyebrow={eyebrow}
      title={boundDetail?.name ?? t('master.securityAccess.roleDetail.titleFallback')}
      description={
        boundDetail?.organizationName ?? (roleScope === 'platform' ? t('master.securityAccess.common.platform') : undefined)
      }
      widthClassName="sm:max-w-xl"
    >
      {roleId && loading && !boundDetail ? (
        <SkeletonCard className="h-48" />
      ) : boundDetail ? (
        <div className="space-y-5 text-sm">
          <section>
            <p className="text-sm text-foreground">{boundDetail.description}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{t('master.securityAccess.roleDetail.userCount', { count: String(boundDetail.userCount) })}</span>
              {boundDetail.lastModified && (
                <span>
                  {t('master.securityAccess.roleDetail.modifiedRelative', {
                    relative: formatRelative(boundDetail.lastModified),
                  })}
                </span>
              )}
              <StatusChip tone="neutral">
                {boundDetail.type === 'system'
                  ? t('master.securityAccess.roles.typeSystem')
                  : t('master.securityAccess.roles.typeCustom')}
              </StatusChip>
            </div>
          </section>

          {criticalCaps.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--status-critical)]" />
                {t('master.securityAccess.roleDetail.criticalCapabilities')}
              </h3>
              <ul className="space-y-1.5">
                {criticalCaps.map((cap) => (
                  <li
                    key={cap}
                    className="rounded-lg border border-[color:var(--status-critical-soft)] bg-[color:var(--status-critical-soft)]/10 px-3 py-2 text-xs"
                  >
                    {cap}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="hidden lg:block">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t('master.securityAccess.roleDetail.permissionGroups')}
            </h3>
            <div className="space-y-3">
              {boundDetail.permissionGroups.map((group) => (
                <details key={group.domain} className="rounded-xl border border-border/60">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{group.domain}</summary>
                  <ul className="border-t border-border/50 px-3 py-2 space-y-1">
                    {group.capabilities.map((cap) => (
                      <li key={cap.key} className="flex items-center justify-between text-xs">
                        <span>{cap.label}</span>
                        <StatusChip tone={cap.critical ? 'critical' : 'neutral'} className="text-[10px]">
                          {cap.level}
                        </StatusChip>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          <p className="text-xs text-muted-foreground lg:hidden">
            {t('master.securityAccess.roleDetail.matrixDesktopOnly')}
          </p>

          {boundDetail.scope === 'organization' && boundDetail.organizationId && (
            <a
              href={`/organizations/${boundDetail.organizationId}/settings/users-roles`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              {t('master.securityAccess.roleDetail.editInTenant')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('master.securityAccess.roleDetail.notFound')}</p>
      )}
    </DetailDrawer>
  );
}