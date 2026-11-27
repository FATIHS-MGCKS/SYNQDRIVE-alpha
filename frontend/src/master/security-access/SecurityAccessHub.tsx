import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { MasterPageHeader } from '../shell';
import { useSecurityAttentionSummary } from './useSecurityAccess';
import { useSecurityAccessPresentation } from './useSecurityAccessPresentation';
import {
  readSecurityAccessLocation,
  syncSecurityAccessUrl,
  type SecurityAccessLocation,
} from './security-access-url';
import type { SecurityAccessSection } from './types';
import { SecurityAccessOverviewTab } from './tabs/SecurityAccessOverviewTab';
import { SecurityUsersTab } from './tabs/SecurityUsersTab';
import { SecurityRolesTab } from './tabs/SecurityRolesTab';
import { SecurityAuditTab } from './tabs/SecurityAuditTab';
import { OwnSecurityTabView } from './tabs/OwnSecurityTab';
import { UserDetailDrawer } from './components/UserDetailDrawer';
import { RoleDetailDrawer } from './components/RoleDetailDrawer';
import { AuditDetailDrawer } from './components/AuditDetailDrawer';
import { AuditExportDialog } from './components/AuditExportDialog';

interface SecurityAccessHubProps {
  onOpenOrganization?: (orgId: string) => void;
}

export function SecurityAccessHub({ onOpenOrganization }: SecurityAccessHubProps) {
  const { t, sectionTabs, loadError, formatRelative } = useSecurityAccessPresentation();
  const initial = useMemo(() => readSecurityAccessLocation(window.location.search), []);
  const [location, setLocation] = useState<SecurityAccessLocation>(initial);
  const [exportOpen, setExportOpen] = useState(false);
  const summary = useSecurityAttentionSummary(loadError);

  const navigate = useCallback((patch: Partial<SecurityAccessLocation>, replace = false) => {
    syncSecurityAccessUrl(patch, { replace });
    setLocation((prev) => ({ ...prev, ...patch }));
  }, []);

  const navigateSection = useCallback(
    (section: SecurityAccessSection) => {
      navigate({
        section,
        userId: section === location.section ? location.userId : null,
        auditId: section === 'audit' || section === 'security-events' ? location.auditId : null,
        eventId: null,
        roleId: section === 'roles' ? location.roleId : null,
      });
    },
    [location.auditId, location.roleId, location.section, location.userId, navigate],
  );

  useEffect(() => {
    const onPop = () => setLocation(readSecurityAccessLocation(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const metaLine = summary.data
    ? t('master.securityAccess.hub.metaAttention', {
        count: String(summary.data.topItems.length > 0 ? summary.data.total : 0),
        relative: formatRelative(summary.data.generatedAt),
      })
    : undefined;

  const auditId = location.auditId ?? location.eventId;

  return (
    <div className="space-y-5" data-testid="security-access-hub">
      <MasterPageHeader
        variant="page"
        title={t('master.securityAccess.hub.title')}
        meta={metaLine}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {location.section === 'audit' && (
              <button
                type="button"
                className="sq-btn-secondary flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
                onClick={() => setExportOpen(true)}
              >
                <Download className="h-4 w-4" />
                {t('master.securityAccess.hub.export')}
              </button>
            )}
            <button
              type="button"
              className="sq-btn-secondary flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
              onClick={() => void summary.refresh()}
              disabled={summary.loading}
              aria-label={t('master.securityAccess.hub.reloadAria')}
            >
              <RefreshCw className={`h-4 w-4 ${summary.loading ? 'animate-spin' : ''}`} />
              {t('master.securityAccess.hub.refresh')}
            </button>
          </div>
        }
        tabs={sectionTabs}
        activeTabId={location.section}
        onTabChange={(id) => navigateSection(id as SecurityAccessSection)}
        tabsAriaLabel={t('master.securityAccess.hub.tabsAria')}
        tabsTestIdPrefix="security-access"
      />

      {location.section === 'overview' && (
        <SecurityAccessOverviewTab
          onNavigateSection={navigateSection}
          onOpenUser={(userId) => navigate({ userId })}
          onOpenAudit={(aid) => navigate({ section: 'audit', auditId: aid })}
        />
      )}

      {location.section === 'users' && (
        <SecurityUsersTab
          variant="users"
          organizationId={location.organizationId}
          onOpenUser={(userId) => navigate({ userId })}
        />
      )}

      {location.section === 'master-admins' && (
        <SecurityUsersTab variant="master-admins" onOpenUser={(userId) => navigate({ userId })} />
      )}

      {location.section === 'roles' && (
        <SecurityRolesTab
          onOpenRole={(roleId, scope, organizationId) =>
            navigate({ roleId, roleScope: scope, orgId: organizationId ?? null })
          }
        />
      )}

      {location.section === 'audit' && (
        <SecurityAuditTab
          organizationId={location.organizationId}
          onOpenAudit={(id) => navigate({ auditId: id })}
        />
      )}

      {location.section === 'security-events' && (
        <SecurityAuditTab
          securityOnly
          onOpenAudit={(id) => navigate({ eventId: id, auditId: id })}
        />
      )}

      {location.section === 'own-security' && (
        <OwnSecurityTabView
          activeTab={location.ownSecurityTab}
          onTabChange={(tab) => navigate({ ownSecurityTab: tab })}
        />
      )}

      <UserDetailDrawer
        userId={location.userId}
        contextLabel={
          location.section === 'master-admins'
            ? t('master.securityAccess.hub.contextPlatformAdmin')
            : t('master.securityAccess.hub.contextUser')
        }
        onClose={() => navigate({ userId: null }, true)}
        onOpenAudit={(id) => navigate({ section: 'audit', auditId: id, userId: null })}
        onOpenOrganization={onOpenOrganization}
        onUserDeleted={() => navigate({ userId: null }, true)}
      />

      <RoleDetailDrawer
        roleId={location.roleId}
        roleScope={location.roleScope}
        organizationId={location.orgId}
        onClose={() => navigate({ roleId: null, roleScope: null, orgId: null }, true)}
      />

      <AuditDetailDrawer
        auditId={auditId}
        onClose={() => navigate({ auditId: null, eventId: null }, true)}
        onOpenFullAudit={(id) => navigate({ section: 'audit', auditId: id, eventId: null })}
      />

      <AuditExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultOrganizationId={location.organizationId}
      />
    </div>
  );
}