import { LogOut, PanelLeftClose, PanelLeftOpen, Settings, Menu, X, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  navItemClass,
  navSectionHeaderClass,
  navSectionLabelClass,
  CollapsedNavTooltip,
} from '../../components/shell';
import { SynqDriveBrandLogo } from '../../components/brand/SynqDriveBrandLogo';
import { clearAuth, getStoredUser } from '../../lib/auth';
import { cn } from '../../components/ui/utils';
import { MASTER_NAV_GROUPS, MASTER_MOBILE_PRIMARY_VIEWS, MASTER_NAV_ITEM_BY_ID } from '../navigation/master-nav.config';
import { isMasterNavGroupActive, isMasterNavItemActive } from '../navigation/master-nav-active';
import { canAccessMasterNavItem, isBillingOnlyMasterUser } from '../navigation/master-nav-permissions';
import { tMasterNav } from '../navigation/master-nav-i18n';
import { useMasterNavBadges, useMasterPlatformStatusLabel } from '../navigation/useMasterNavBadges';
import type { MasterNavBadgeType, MasterView } from '../navigation/master-nav.types';
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
}

function NavBadge({ type, value }: { type: MasterNavBadgeType; value?: string | number | boolean }) {
  if (!value) return null;
  if (type === 'support-count') {
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
}: SidebarProps) {
  const mobileNavId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of MASTER_NAV_GROUPS) {
      init[g.id] = g.defaultExpanded;
    }
    return init;
  });
  const badges = useMasterNavBadges();
  const platformLabel = useMasterPlatformStatusLabel(badges);
  const user = getStoredUser();
  const billingOnly = isBillingOnlyMasterUser();
  const firstMobileFocusRef = useRef<HTMLButtonElement>(null);

  const activeCtx = useMemo(
    () => ({ view: currentView, settingsTab, selectedOrgId }),
    [currentView, settingsTab, selectedOrgId],
  );

  const visibleGroups = useMemo(() => {
    return MASTER_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((id) => {
        const item = MASTER_NAV_ITEM_BY_ID[id];
        return item && canAccessMasterNavItem(item);
      }),
    })).filter((g) => g.items.length > 0);
  }, []);

  useEffect(() => {
    const activeGroupId = visibleGroups.find((g) => isMasterNavGroupActive(g.items, activeCtx))?.id;
    if (!activeGroupId) return;
    setExpanded((prev) => ({ ...prev, [activeGroupId]: true }));
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
    setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderNavButton = (
    itemId: MasterView,
    opts?: { collapsed?: boolean; compact?: boolean; buttonRef?: React.Ref<HTMLButtonElement> },
  ) => {
    const item = MASTER_NAV_ITEM_BY_ID[itemId];
    if (!item || !canAccessMasterNavItem(item)) return null;
    const active = isMasterNavItemActive(itemId, activeCtx);
    const Icon = item.icon;
    const badgeVal = item.badge ? badges[item.badge] : undefined;
    const label = tMasterNav(item.labelKey);

    return (
      <button
        key={itemId}
        ref={opts?.buttonRef}
        type="button"
        onClick={() => go(itemId)}
        className={navItemClass(active, Boolean(opts?.collapsed))}
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

  const renderGroups = (mode: 'expanded' | 'collapsed' | 'mobile') => {
    const collapsed = mode === 'collapsed';
    const isMobile = mode === 'mobile';

    const primaryItems = isMobile
      ? MASTER_MOBILE_PRIMARY_VIEWS.filter((id) => {
          const item = MASTER_NAV_ITEM_BY_ID[id];
          return item && canAccessMasterNavItem(item);
        })
      : [];

    return (
      <>
        {isMobile && primaryItems.length > 0 && (
          <div className="mb-3">
            <div className={cn(navSectionLabelClass, 'mt-0 mb-1.5 px-2.5')}>{tMasterNav('master.nav.primarySection')}</div>
            <nav className="space-y-0.5" aria-label={tMasterNav('master.nav.primarySection')}>
              {primaryItems.map((id, idx) =>
                renderNavButton(id, { buttonRef: idx === 0 ? firstMobileFocusRef : undefined }),
              )}
            </nav>
            <div className="my-3 h-px bg-border" />
          </div>
        )}

        {visibleGroups.map((group) => {
          if (billingOnly && group.id !== 'overview' && group.id !== 'commerce') return null;

          const isOpen = group.collapsible ? expanded[group.id] : true;
          const groupActive = isMasterNavGroupActive(group.items, activeCtx);
          const showHeader = group.collapsible && !collapsed;

          return (
            <div key={group.id} className={collapsed ? 'w-full flex flex-col items-center' : 'mb-1'}>
              {showHeader && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={navSectionHeaderClass(isOpen, groupActive)}
                  aria-expanded={isOpen}
                >
                  <span className={navSectionLabelClass}>{tMasterNav(group.labelKey)}</span>
                  <ChevronRight className={cn('w-3 h-3 shrink-0 text-muted-foreground/60 transition-transform duration-200', isOpen && 'rotate-90')} />
                </button>
              )}
              {!group.collapsible && !collapsed && group.items.length > 1 && (
                <div className={cn(navSectionLabelClass, 'mt-5 mb-1 px-2.5')}>{tMasterNav(group.labelKey)}</div>
              )}
              {!group.collapsible && !collapsed && group.items.length === 1 && group.id !== 'overview' && (
                <div className={cn(navSectionLabelClass, 'mt-5 mb-1 px-2.5')}>{tMasterNav(group.labelKey)}</div>
              )}
              {collapsed && group.id !== 'overview' && <div className="w-4 h-px my-1.5 bg-border" />}
              {(isOpen || collapsed || !group.collapsible) && (
                <nav
                  className={cn('space-y-0.5', collapsed ? 'w-full flex flex-col items-center' : 'mb-1')}
                  aria-label={tMasterNav(group.labelKey)}
                >
                  {group.items.map((id) => renderNavButton(id, { collapsed }))}
                </nav>
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

    return (
      <div className="sq-sidebar-footer shrink-0 px-3 py-3 space-y-1 border-t border-sidebar-border">
        {!billingOnly && (
          <button
            type="button"
            onClick={() => go('platform-health')}
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
                {tMasterNav('master.nav.systemStatus')}:{' '}
                <span className="text-foreground font-semibold">
                  {platformLabel === 'degraded'
                    ? tMasterNav('master.nav.systemStatusDegraded')
                    : tMasterNav('master.nav.systemStatusOperational')}
                </span>
              </span>
            )}
            {collapsed && (
              <CollapsedNavTooltip
                label={`${tMasterNav('master.nav.systemStatus')}: ${
                  platformLabel === 'degraded'
                    ? tMasterNav('master.nav.systemStatusDegraded')
                    : tMasterNav('master.nav.systemStatusOperational')
                }`}
              />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => go('settings', { settingsTab: 'general' })}
          className={cn(
            navItemClass(currentView === 'settings', collapsed),
            collapsed && 'relative group',
          )}
          aria-current={currentView === 'settings' ? 'page' : undefined}
        >
          <Settings className="w-[14px] h-[14px] shrink-0" />
          {!collapsed && <span>{tMasterNav('master.nav.settings')}</span>}
          {collapsed && <CollapsedNavTooltip label={tMasterNav('master.nav.settings')} />}
        </button>

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
              <span className="block text-[12px] font-semibold text-foreground truncate">{user?.name || tMasterNav('master.nav.account')}</span>
              <span className="block text-[10px] text-muted-foreground truncate">{user?.email}</span>
            </span>
          )}
          {collapsed && <CollapsedNavTooltip label={tMasterNav('master.nav.account')} />}
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
          {!collapsed && <span>{tMasterNav('master.nav.logout')}</span>}
          {collapsed && <CollapsedNavTooltip label={tMasterNav('master.nav.logout')} />}
        </button>

        {showCollapse && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'sq-sidebar-footer__toggle mt-1',
              collapsed && 'sq-sidebar-footer__toggle--icon-only relative group',
            )}
            aria-label={collapsed ? tMasterNav('master.nav.expandSidebar') : tMasterNav('master.nav.collapseSidebar')}
          >
            <span className="sq-sidebar-footer__icon">
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </span>
            {!collapsed && <span className="sq-sidebar-footer__label">{tMasterNav('master.nav.collapseSidebar')}</span>}
            {collapsed && <CollapsedNavTooltip label={tMasterNav('master.nav.expandSidebar')} />}
          </button>
        )}
      </div>
    );
  };

  const brandChip = (
    <span className="sq-chip sq-chip-neutral !text-[10px] !font-bold uppercase tracking-[0.16em]">
      {tMasterNav('master.nav.roleChip')}
    </span>
  );

  return (
    <>
      <MasterAccountSheet open={accountOpen} onOpenChange={setAccountOpen} onOpenSettings={() => go('settings', { settingsTab: 'general' })} />

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b bg-sidebar border-sidebar-border pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="p-2 -ml-2 rounded-md transition-colors hover:bg-accent text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-expanded={mobileOpen}
            aria-controls={mobileNavId}
            aria-label={mobileOpen ? tMasterNav('master.nav.mobileMenuClose') : tMasterNav('master.nav.mobileMenu')}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <SynqDriveBrandLogo className="h-4 w-auto object-contain" />
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

      {/* Desktop sidebar */}
      <div
        className={cn(
          'hidden lg:flex h-screen flex-col shrink-0 border-r bg-sidebar border-sidebar-border transition-all duration-300 ease-in-out motion-reduce:transition-none',
          isCollapsed ? 'w-[52px]' : 'w-[260px]',
        )}
      >
        <div className={cn('border-b border-sidebar-border shrink-0 flex flex-col items-center gap-1.5', isCollapsed ? 'px-2 py-3' : 'px-4 py-3')}>
          <SynqDriveBrandLogo className={cn('w-auto object-contain', isCollapsed ? 'h-5' : 'h-7')} />
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
