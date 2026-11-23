import { LogOut, PanelLeftClose, PanelLeftOpen, Menu, X, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  navItemClass,
  subNavItemClass,
  navSectionHeaderClass,
  navSectionLabelClass,
  CollapsedNavTooltip,
} from '../../components/shell';
import { SynqDriveBrandLogo } from '../../components/brand/SynqDriveBrandLogo';
import { clearAuth, getStoredUser } from '../../lib/auth';
import { cn } from '../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  MASTER_NAV_GROUPS,
  MASTER_NAV_ITEM_BY_ID,
  collectViewsFromGroup,
} from '../navigation/master-nav.config';
import {
  isMasterNavGroupActive,
  isMasterNavItemActive,
  isMasterNavParentEntryActive,
} from '../navigation/master-nav-active';
import { canAccessMasterNavItem, isBillingOnlyMasterUser } from '../navigation/master-nav-permissions';
import { tMasterNav } from '../navigation/master-nav-i18n';
import { useMasterNavBadges, useMasterPlatformStatusLabel } from '../navigation/useMasterNavBadges';
import type { MasterNavBadgeType, MasterNavEntry, MasterView } from '../navigation/master-nav.types';
import { MasterAccountSheet } from './MasterAccountSheet';

export type { MasterView } from '../navigation/master-nav.types';

interface SidebarProps {
  isDarkMode: boolean;
  currentView?: MasterView;
  settingsTab?: string;
  selectedOrgId?: string | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: (view: MasterView, options?: { settingsTab?: string; replace?: boolean }) => void;
  onOpenOwnSecurity?: () => void;
}

function NavBadge({ type, value }: { type: MasterNavBadgeType; value?: string | number | boolean }) {
  if (!value) return null;
  if (type === 'support-count' || type === 'security-attention') {
    return (
      <span className="ml-auto min-w-[18px] rounded-full bg-[color:var(--brand)] px-1 text-center text-[9px] font-bold leading-[18px] text-white tabular-nums">
        {value}
      </span>
    );
  }
  const tone =
    type === 'platform-critical' || type === 'integration-outage'
      ? 'sq-dot-critical'
      : type === 'mfa-required' || type === 'billing-anomaly' || type === 'connectivity-warning'
        ? 'sq-dot-watch'
        : 'sq-dot-info';
  return <span className={cn('ml-auto sq-dot shrink-0', tone)} aria-hidden />;
}

export function Sidebar({
  currentView = 'dashboard',
  settingsTab = 'general',
  selectedOrgId = null,
  isCollapsed = false,
  onToggleCollapse,
  onNavigate,
  onOpenOwnSecurity,
}: SidebarProps) {
  const mobileNavId = useId();
  const { t } = useLanguage();
  const navLabel = useCallback(
    (key: string) => {
      const fromPlatform = t(key as Parameters<typeof t>[0]);
      return fromPlatform !== key ? fromPlatform : tMasterNav(key);
    },
    [t],
  );

  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of MASTER_NAV_GROUPS) {
      init[g.id] = g.defaultExpanded;
    }
    return init;
  });
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const badges = useMasterNavBadges();
  const platformLabel = useMasterPlatformStatusLabel(badges);
  const user = getStoredUser();
  const billingOnly = isBillingOnlyMasterUser();
  const firstMobileFocusRef = useRef<HTMLButtonElement>(null);
  const supportItem = MASTER_NAV_ITEM_BY_ID.support;

  const activeCtx = useMemo(
    () => ({ view: currentView, settingsTab, selectedOrgId }),
    [currentView, settingsTab, selectedOrgId],
  );

  const visibleGroups = useMemo(() => {
    return MASTER_NAV_GROUPS.map((group) => ({
      ...group,
      entries: group.entries
        .map((entry) => {
          if (entry.type === 'link') {
            const item = MASTER_NAV_ITEM_BY_ID[entry.view];
            return item && canAccessMasterNavItem(item) ? entry : null;
          }
          if (entry.type === 'parent') {
            const parent = MASTER_NAV_ITEM_BY_ID[entry.view];
            if (!parent || !canAccessMasterNavItem(parent)) return null;
            const children = entry.children.filter((id) => {
              const child = MASTER_NAV_ITEM_BY_ID[id];
              return child && canAccessMasterNavItem(child);
            });
            if (children.length === 0) return { ...entry, children: [] as MasterView[] };
            return { ...entry, children };
          }
          const children = entry.children.filter((id) => {
            const child = MASTER_NAV_ITEM_BY_ID[id];
            return child && canAccessMasterNavItem(child);
          });
          if (children.length === 0) return null;
          return { ...entry, children };
        })
        .filter(Boolean) as MasterNavEntry[],
    })).filter((g) => g.entries.length > 0);
  }, []);

  useEffect(() => {
    for (const group of visibleGroups) {
      const views = collectViewsFromGroup(group);
      if (isMasterNavGroupActive(views, activeCtx)) {
        setExpandedGroups((prev) => ({ ...prev, [group.id]: true }));
      }
      for (const entry of group.entries) {
        if (entry.type === 'parent' && isMasterNavParentEntryActive(entry.view, entry.children, activeCtx)) {
          setExpandedParents((prev) => ({ ...prev, [entry.view]: true }));
        }
        if (entry.type === 'folder') {
          const folderKey = `${group.id}:${entry.labelKey}`;
          if (entry.children.some((id) => isMasterNavItemActive(id, activeCtx))) {
            setExpandedFolders((prev) => ({ ...prev, [folderKey]: true }));
          }
        }
      }
    }
  }, [activeCtx, visibleGroups]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen) {
      requestAnimationFrame(() => firstMobileFocusRef.current?.focus());
    }
  }, [mobileOpen]);

  const go = useCallback(
    (view: MasterView, opts?: { settingsTab?: string }) => {
      onNavigate?.(view, opts);
      setMobileOpen(false);
    },
    [onNavigate],
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleParent = (view: MasterView) => {
    setExpandedParents((prev) => ({ ...prev, [view]: !prev[view] }));
  };

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderKey]: !prev[folderKey] }));
  };

  const renderNavButton = (
    itemId: MasterView,
    opts?: { collapsed?: boolean; sub?: boolean; buttonRef?: React.Ref<HTMLButtonElement> },
  ) => {
    const item = MASTER_NAV_ITEM_BY_ID[itemId];
    if (!item || !canAccessMasterNavItem(item)) return null;
    const active = isMasterNavItemActive(itemId, activeCtx);
    const Icon = item.icon;
    const badgeVal = item.badge ? badges[item.badge] : undefined;
    const label = navLabel(item.labelKey);
    const className = opts?.sub
      ? subNavItemClass(active)
      : navItemClass(active, Boolean(opts?.collapsed));

    return (
      <button
        key={itemId}
        ref={opts?.buttonRef}
        type="button"
        onClick={() => go(itemId)}
        className={className}
        aria-current={active ? 'page' : undefined}
        aria-label={opts?.collapsed ? label : undefined}
      >
        <span className="relative shrink-0">
          <Icon className="w-[14px] h-[14px]" />
          {opts?.collapsed && item.badge && badgeVal && (
            <span className="absolute -right-1 -top-1 flex">
              {item.badge === 'support-count' && typeof badgeVal === 'number' ? (
                <span className="min-w-[14px] rounded-full bg-[color:var(--brand)] px-0.5 text-[8px] font-bold leading-[14px] text-white">
                  {badgeVal}
                </span>
              ) : (
                <span className="sq-dot sq-dot-critical h-1.5 w-1.5" />
              )}
            </span>
          )}
        </span>
        {!opts?.collapsed && (
          <>
            <span className="truncate">{label}</span>
            {item.badge && <NavBadge type={item.badge} value={badgeVal} />}
          </>
        )}
        {opts?.collapsed && <CollapsedNavTooltip label={label} />}
      </button>
    );
  };

  const renderEntry = (entry: MasterNavEntry, groupId: string, mode: 'expanded' | 'collapsed' | 'mobile') => {
    const collapsed = mode === 'collapsed';
    if (entry.type === 'link') {
      return renderNavButton(entry.view, { collapsed });
    }
    if (entry.type === 'folder') {
      const folderKey = `${groupId}:${entry.labelKey}`;
      const isOpen = expandedFolders[folderKey] ?? false;
      const folderActive = entry.children.some((id) => isMasterNavItemActive(id, activeCtx));
      if (collapsed) {
        return entry.children.map((id) => renderNavButton(id, { collapsed }));
      }
      return (
        <div key={folderKey} className="mt-1">
          <button
            type="button"
            onClick={() => toggleFolder(folderKey)}
            className={navSectionHeaderClass(isOpen, folderActive)}
            aria-expanded={isOpen}
          >
            <span className={navSectionLabelClass}>{navLabel(entry.labelKey)}</span>
            <ChevronRight
              className={cn(
                'w-3 h-3 shrink-0 text-muted-foreground/60 transition-transform duration-200',
                isOpen && 'rotate-90',
              )}
            />
          </button>
          {isOpen && (
            <nav className="mt-0.5 ml-1 space-y-0.5 border-l border-border/60 pl-1.5" aria-label={navLabel(entry.labelKey)}>
              {entry.children.map((id) => renderNavButton(id, { sub: true }))}
            </nav>
          )}
        </div>
      );
    }
    const parent = MASTER_NAV_ITEM_BY_ID[entry.view];
    if (!parent) return null;
    const parentActive = isMasterNavParentEntryActive(entry.view, entry.children, activeCtx);
    const parentOpen = expandedParents[entry.view] ?? false;
    const parentLabel = navLabel(parent.labelKey);
    const ParentIcon = parent.icon;
    const parentBadge = parent.badge ? badges[parent.badge] : undefined;

    if (collapsed) {
      return (
        <>
          {renderNavButton(entry.view, { collapsed })}
          {entry.children.map((id) => renderNavButton(id, { collapsed }))}
        </>
      );
    }

    return (
      <div key={entry.view} className="space-y-0.5">
        <div className="flex items-stretch gap-0.5">
          <button
            type="button"
            onClick={() => go(entry.view)}
            className={cn(navItemClass(isMasterNavItemActive(entry.view, activeCtx)), 'flex-1 min-w-0')}
            aria-current={isMasterNavItemActive(entry.view, activeCtx) ? 'page' : undefined}
          >
            <ParentIcon className="w-[14px] h-[14px] shrink-0" />
            <span className="truncate">{parentLabel}</span>
            {parent.badge && <NavBadge type={parent.badge} value={parentBadge} />}
          </button>
          {entry.children.length > 0 && (
            <button
              type="button"
              onClick={() => toggleParent(entry.view)}
              className={cn(
                'shrink-0 flex items-center justify-center w-8 rounded-lg',
                'text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-expanded={parentOpen}
              aria-label={parentLabel}
            >
              <ChevronRight
                className={cn('w-3.5 h-3.5 transition-transform duration-200', parentOpen && 'rotate-90')}
              />
            </button>
          )}
        </div>
        {parentOpen && entry.children.length > 0 && (
          <nav
            className="ml-3 space-y-0.5 border-l border-border/60 pl-2"
            aria-label={parentLabel}
          >
            {entry.children.map((id) => renderNavButton(id, { sub: true }))}
          </nav>
        )}
        {!parentOpen && parentActive && entry.children.some((id) => isMasterNavItemActive(id, activeCtx)) && (
          <nav className="ml-3 space-y-0.5 border-l border-border/60 pl-2" aria-label={parentLabel}>
            {entry.children.map((id) => renderNavButton(id, { sub: true }))}
          </nav>
        )}
      </div>
    );
  };

  const renderDashboard = (mode: 'expanded' | 'collapsed' | 'mobile') => {
    const collapsed = mode === 'collapsed';
    const dash = MASTER_NAV_ITEM_BY_ID.dashboard;
    if (!dash || !canAccessMasterNavItem(dash)) return null;
    {
      return (
        <nav className={cn('space-y-0.5', collapsed ? 'w-full flex flex-col items-center' : 'mb-2')} aria-label={navLabel(dash.labelKey)}>
          {renderNavButton('dashboard', {
            collapsed,
            buttonRef: mode === 'mobile' ? firstMobileFocusRef : undefined,
          })}
        </nav>
      );
    }
    return null;
  };

  const renderGroups = (mode: 'expanded' | 'collapsed' | 'mobile') => {
    const collapsed = mode === 'collapsed';

    return (
      <>
        {renderDashboard(mode)}
        {visibleGroups.map((group) => {
          if (billingOnly && group.id !== 'produkte-business') return null;

          const isOpen = group.collapsible ? expandedGroups[group.id] : true;
          const groupViews = collectViewsFromGroup(group);
          const groupActive = isMasterNavGroupActive(groupViews, activeCtx);

          const entries =
            billingOnly
              ? group.entries.filter((e) => e.type === 'link' && e.view === 'billing')
              : group.entries;

          if (entries.length === 0) return null;

          return (
            <div key={group.id} className={collapsed ? 'w-full flex flex-col items-center' : 'mb-1'}>
              {group.collapsible && !collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={navSectionHeaderClass(isOpen, groupActive)}
                  aria-expanded={isOpen}
                >
                  <span className={navSectionLabelClass}>{navLabel(group.labelKey)}</span>
                  <ChevronRight
                    className={cn(
                      'w-3 h-3 shrink-0 text-muted-foreground/60 transition-transform duration-200',
                      isOpen && 'rotate-90',
                    )}
                  />
                </button>
              )}
              {(isOpen || collapsed) && (
                <div
                  className={cn('space-y-0.5', collapsed ? 'w-full flex flex-col items-center' : 'mb-1 mt-0.5')}
                  role="navigation"
                  aria-label={navLabel(group.labelKey)}
                >
                  {entries.map((entry) => renderEntry(entry, group.id, mode))}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  const renderFooter = (mode: 'expanded' | 'collapsed' | 'mobile') => {
    const collapsed = mode === 'collapsed';
    const showCollapse = mode === 'expanded' || mode === 'collapsed';
    const canSupport = supportItem && canAccessMasterNavItem(supportItem);
    const supportBadge = supportItem?.badge ? badges[supportItem.badge] : undefined;

    return (
      <div className="sq-sidebar-footer shrink-0 px-3 py-3 space-y-1 border-t border-sidebar-border">
        {!billingOnly && (
          <button
            type="button"
            onClick={() => go('platform-ops')}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 min-h-[40px] rounded-lg text-left text-[12px] font-medium transition-colors hover:bg-accent/50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <span
              className={cn('sq-dot shrink-0', platformLabel === 'degraded' ? 'sq-dot-critical' : 'sq-dot-success')}
              aria-hidden
            />
            {!collapsed && (
              <span className="truncate text-muted-foreground">
                {navLabel('master.nav.systemStatus')}:{' '}
                <span className="text-foreground font-semibold">
                  {platformLabel === 'degraded'
                    ? navLabel('master.nav.systemStatusDegraded')
                    : navLabel('master.nav.systemStatusOperational')}
                </span>
              </span>
            )}
            {collapsed && (
              <CollapsedNavTooltip
                label={`${navLabel('master.nav.systemStatus')}: ${
                  platformLabel === 'degraded'
                    ? navLabel('master.nav.systemStatusDegraded')
                    : navLabel('master.nav.systemStatusOperational')
                }`}
              />
            )}
          </button>
        )}

        {canSupport && (
          <button
            type="button"
            onClick={() => go('support')}
            className={cn(navItemClass(currentView === 'support', collapsed), collapsed && 'relative group')}
            aria-current={currentView === 'support' ? 'page' : undefined}
          >
            <supportItem.icon className="w-[14px] h-[14px] shrink-0" />
            {!collapsed && (
              <>
                <span>{navLabel(supportItem.labelKey)}</span>
                {supportItem.badge && <NavBadge type={supportItem.badge} value={supportBadge} />}
              </>
            )}
            {collapsed && <CollapsedNavTooltip label={navLabel(supportItem.labelKey)} />}
          </button>
        )}

        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 min-h-[40px] rounded-lg transition-colors hover:bg-accent/50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center relative group',
          )}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold text-foreground">
            {(user?.name || 'MA').slice(0, 2).toUpperCase()}
            {badges['mfa-required'] && (
              <span className="absolute -right-0.5 -top-0.5 sq-dot sq-dot-watch h-2 w-2" aria-hidden />
            )}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-left">
              <span className="block text-[12px] font-semibold text-foreground truncate">
                {user?.name || navLabel('master.nav.account')}
              </span>
              <span className="block text-[10px] text-muted-foreground truncate">{user?.email}</span>
            </span>
          )}
          {collapsed && <CollapsedNavTooltip label={navLabel('master.nav.account')} />}
        </button>

        <button
          type="button"
          onClick={() => {
            clearAuth();
            window.location.href = '/login';
          }}
          className={cn(navItemClass(false, collapsed), collapsed && 'relative group')}
        >
          <LogOut className="w-[14px] h-[14px] shrink-0" />
          {!collapsed && <span>{navLabel('master.nav.logout')}</span>}
          {collapsed && <CollapsedNavTooltip label={navLabel('master.nav.logout')} />}
        </button>

        {showCollapse && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'sq-sidebar-footer__toggle mt-1',
              collapsed && 'sq-sidebar-footer__toggle--icon-only relative group',
            )}
            aria-label={
              collapsed ? navLabel('master.nav.expandSidebar') : navLabel('master.nav.collapseSidebar')
            }
          >
            <span className="sq-sidebar-footer__icon">
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </span>
            {!collapsed && (
              <span className="sq-sidebar-footer__label">{navLabel('master.nav.collapseSidebar')}</span>
            )}
            {collapsed && <CollapsedNavTooltip label={navLabel('master.nav.expandSidebar')} />}
          </button>
        )}
      </div>
    );
  };

  const brandChip = (
    <span className="sq-chip sq-chip-neutral !text-[10px] !font-bold uppercase tracking-[0.16em]">
      {navLabel('master.nav.roleChip')}
    </span>
  );

  return (
    <>
      <MasterAccountSheet
        open={accountOpen}
        onOpenChange={setAccountOpen}
        onOpenSettings={() => go('platform-integrations')}
        onOpenOwnSecurity={onOpenOwnSecurity}
      />

      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b bg-sidebar border-sidebar-border pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="p-2 -ml-2 rounded-md transition-colors hover:bg-accent text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-expanded={mobileOpen}
            aria-controls={mobileNavId}
            aria-label={mobileOpen ? navLabel('master.nav.mobileMenuClose') : navLabel('master.nav.mobileMenu')}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <SynqDriveBrandLogo className="h-6 w-auto max-w-[200px] object-contain" />
          <div className="w-11" />
        </div>

        <div
          id={mobileNavId}
          className={cn(
            'overflow-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none',
            mobileOpen ? 'max-h-[min(calc(100dvh-3.5rem),calc(100vh-3.5rem))] opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <div
            className="flex flex-col px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] overflow-y-auto border-t border-sidebar-border"
            style={{ maxHeight: 'min(calc(100dvh - 3.5rem), calc(100vh - 3.5rem))' }}
          >
            <div className="flex-1 py-3">{renderGroups('mobile')}</div>
            {renderFooter('mobile')}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 overlay-scrim motion-reduce:backdrop-blur-none"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <div
        className={cn(
          'hidden lg:flex h-screen flex-col shrink-0 border-r bg-sidebar border-sidebar-border transition-all duration-300 ease-in-out motion-reduce:transition-none',
          isCollapsed ? 'w-[52px]' : 'w-[260px]',
        )}
      >
        <div
          className={cn(
            'border-b border-sidebar-border shrink-0 flex flex-col items-center gap-1.5',
            isCollapsed ? 'px-2 py-3' : 'px-4 py-3',
          )}
        >
          <SynqDriveBrandLogo variant={isCollapsed ? 'mark' : 'full'} className="h-[18px] w-auto object-contain" />
          {!isCollapsed && brandChip}
        </div>

        <div
          className={cn('flex-1 overflow-y-auto py-4', isCollapsed ? 'px-1.5 flex flex-col items-center' : 'px-4')}
          style={{ scrollbarWidth: 'thin' }}
        >
          {renderGroups(isCollapsed ? 'collapsed' : 'expanded')}
        </div>

        {renderFooter(isCollapsed ? 'collapsed' : 'expanded')}
      </div>
    </>
  );
}