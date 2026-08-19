
import { AlertCircle, ArrowRight, Calendar, Car, DollarSign, FileText, Home, ListTodo, MapPin, Search, Settings, Tag, Users } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { clearAuth, getStoredUser } from '../../lib/auth';
import { formatTopBarWelcomeLabel } from '../../lib/topbarUserLabel';
import { VehicleData } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { LanguageSelector } from '../../i18n/components/LanguageSelector';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { unwrapTaskListPage } from '../../lib/tasks-pagination';
import { OperatorEntryButton } from '../../operator/components/OperatorEntryButton';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { useAppTheme } from '../../context/AppThemeContext';
import type { SettingsTabInput } from './settings/settingsTypes';

interface TopBarProps {
  onViewChange?: (view: string) => void;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onSettingsTabChange?: (tab: SettingsTabInput) => void;
  onFinanceTabChange?: (tab: 'invoices' | 'price-tariffs') => void;
}

function formatLoggedInLabel(
  user: ReturnType<typeof getStoredUser>,
  t: (key: 'topbar.welcomeBack' | 'topbar.welcomeBackGeneric', vars?: Record<string, string | number>) => string,
): string {
  return formatTopBarWelcomeLabel(
    user,
    (name) => t('topbar.welcomeBack', { name }),
    t('topbar.welcomeBackGeneric'),
  );
}

export function TopBar({ onViewChange, onVehicleSelect, onSettingsTabChange, onFinanceTabChange }: TopBarProps) {
  const { preference, cycleThemePreference } = useAppTheme();
  const { t } = useLanguage();
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentUser = getStoredUser();
  const currentUserName = currentUser?.name || currentUser?.email || t('common.user');
  const currentUserEmail = currentUser?.email || '';
  const currentUserInitials = useMemo(() => {
    if (currentUser?.name && currentUser.name.trim()) {
      const parts = currentUser.name.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
      return currentUser.name.slice(0, 2).toUpperCase();
    }
    if (currentUser?.email) return currentUser.email.slice(0, 2).toUpperCase();
    return 'U';
  }, [currentUser?.name, currentUser?.email]);

  const loggedInLabel = useMemo(() => formatLoggedInLabel(currentUser, t), [currentUser, t]);

  const [searchCustomers, setSearchCustomers] = useState<any[]>([]);
  const [searchBookings, setSearchBookings] = useState<any[]>([]);
  const [searchInvoices, setSearchInvoices] = useState<any[]>([]);
  const [searchTasks, setSearchTasks] = useState<any[]>([]);
  const [searchFines, setSearchFines] = useState<any[]>([]);

  useEffect(() => {
    if (!orgId || searchQuery.trim().length < 2) {
      setSearchCustomers([]);
      setSearchBookings([]);
      setSearchInvoices([]);
      setSearchTasks([]);
      setSearchFines([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([
        (api.customers.list as (id: string) => Promise<any>)(orgId).then((r) => (Array.isArray(r) ? r : r?.data ?? [])).catch(() => []),
        api.bookings.list(orgId).catch(() => []),
        api.invoices.list(orgId).catch(() => []),
        api.tasks
          .list(orgId, { limit: 30, search: searchQuery })
          .then((page) => unwrapTaskListPage(page).data)
          .catch(() => []),
        api.fines.list(orgId).catch(() => []),
      ]).then(([customers, bookings, invoices, tasks, fines]) => {
        if (cancelled) return;
        setSearchCustomers(Array.isArray(customers) ? customers : []);
        setSearchBookings(Array.isArray(bookings) ? bookings : []);
        setSearchInvoices(Array.isArray(invoices) ? invoices : []);
        setSearchTasks(Array.isArray(tasks) ? tasks : []);
        setSearchFines(Array.isArray(fines) ? fines : []);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, orgId]);

  const navigationItems = useMemo(
    () =>
      [
        { view: 'dashboard', label: t('nav.dashboard'), icon: Home, category: t('category.operations') },
        { view: 'bookings', label: t('nav.bookings'), icon: Calendar, category: t('category.operations') },
        { view: 'customers', label: t('nav.customers'), icon: Users, category: t('category.operations') },
        { view: 'stations', label: t('nav.stations'), icon: MapPin, category: t('category.operations') },
        { view: 'tasks', label: t('nav.tasks'), icon: ListTodo, category: t('category.operations') },
        { view: 'fleet', label: t('nav.fleet'), icon: Car, category: t('category.fleet') },
        { view: 'financial-insights', label: t('nav.insights'), icon: DollarSign, category: t('category.finance') },
        { view: 'invoices', label: t('nav.invoices'), icon: FileText, category: t('category.finance') },
        { view: 'price-tariffs', label: t('view.priceTariffs'), icon: Tag, category: t('category.finance') },
        { view: 'settings', label: t('view.settings'), icon: Settings, category: t('category.administration') },
      ] as const,
    [t],
  );

  const searchCategoryLabels = useMemo(
    () => ({
      vehicles: t('topbar.searchCategory.vehicles'),
      customers: t('topbar.searchCategory.customers'),
      bookings: t('topbar.searchCategory.bookings'),
      invoices: t('topbar.searchCategory.invoices'),
      tasks: t('topbar.searchCategory.tasks'),
      fines: t('topbar.searchCategory.fines'),
      pages: t('topbar.searchCategory.pages'),
    }),
    [t],
  );

  // Build search results
  type SearchResult = { type: 'vehicle' | 'customer' | 'booking' | 'invoice' | 'task' | 'fine' | 'page'; id: string; title: string; subtitle: string; category: string; data?: any };

  const getSearchResults = useCallback((): SearchResult[] => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    // Vehicles
    fleetVehicles.forEach(v => {
      if (v.model.toLowerCase().includes(q) || v.license.toLowerCase().includes(q) || v.station.toLowerCase().includes(q)) {
        results.push({ type: 'vehicle', id: v.id, title: v.model, subtitle: `${v.license} · ${v.status} · ${v.station}`, category: searchCategoryLabels.vehicles, data: v });
      }
    });

    // Customers (org-scoped API, client-filtered)
    searchCustomers.forEach(c => {
      const name = c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
      const email = c.email ?? '';
      const license = c.licenseNumber ?? c.license ?? '';
      const haystack = [name, email, license].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'customer', id: c.id, title: name || email || c.id, subtitle: [email, license].filter(Boolean).join(' · '), category: searchCategoryLabels.customers });
      }
    });

    // Bookings
    searchBookings.forEach(b => {
      const ref = b.bookingNumber ?? b.reference ?? b.id ?? '';
      const customer = b.customerName ?? b.customer ?? '';
      const vehicle = b.vehicleName ?? b.vehicle ?? '';
      const status = b.status ?? '';
      const haystack = [ref, customer, vehicle, status].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'booking', id: b.id, title: String(ref), subtitle: [customer, vehicle, status].filter(Boolean).join(' · '), category: searchCategoryLabels.bookings });
      }
    });

    // Invoices
    searchInvoices.forEach(inv => {
      const ref = inv.invoiceNumber != null ? `#${inv.invoiceNumber}` : inv.id ?? '';
      const customer = inv.customerName ?? inv.customer ?? '';
      const amount = inv.totalCents != null ? `€${(inv.totalCents / 100).toFixed(2)}` : inv.amount ?? '';
      const status = inv.status ?? '';
      const haystack = [String(ref), customer, amount, status].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'invoice', id: inv.id, title: String(ref), subtitle: [customer, amount, status].filter(Boolean).join(' · '), category: searchCategoryLabels.invoices });
      }
    });

    // Tasks
    searchTasks.forEach((task) => {
      const title = task.title ?? '';
      const priority = task.priority ?? '';
      const status = task.status ?? '';
      const haystack = [title, task.id, priority, status].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'task', id: task.id, title, subtitle: [priority, status].filter(Boolean).join(' · '), category: searchCategoryLabels.tasks });
      }
    });

    // Fines
    searchFines.forEach(f => {
      const reason = f.title ?? f.reason ?? f.offenseType ?? t('topbar.fineFallback');
      const vehicle = f.vehicleLabel ?? f.vehicleId ?? '';
      const amount = f.amountCents != null ? `€${(f.amountCents / 100).toFixed(2)}` : '';
      const haystack = [reason, vehicle, f.id].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'fine', id: f.id, title: reason, subtitle: [vehicle, amount].filter(Boolean).join(' · '), category: searchCategoryLabels.fines });
      }
    });

    // Pages/Navigation
    navigationItems.forEach(nav => {
      if (nav.label.toLowerCase().includes(q) || nav.category.toLowerCase().includes(q)) {
        results.push({ type: 'page', id: nav.view, title: nav.label, subtitle: nav.category, category: searchCategoryLabels.pages });
      }
    });

    return results.slice(0, 12);
  }, [searchQuery, fleetVehicles, searchCustomers, searchBookings, searchInvoices, searchTasks, searchFines, navigationItems, searchCategoryLabels, t]);

  const searchResults = getSearchResults();

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(0); }, [searchQuery]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ⌘K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setSearchQuery('');
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectResult = (result: SearchResult) => {
    setSearchQuery('');
    setIsSearchOpen(false);
    switch (result.type) {
      case 'vehicle':
        if (result.data && onVehicleSelect) onVehicleSelect(result.data);
        onViewChange?.('overview');
        break;
      case 'customer':
        onViewChange?.('customers');
        break;
      case 'booking':
        onViewChange?.('bookings');
        break;
      case 'invoice':
        onFinanceTabChange?.('invoices');
        onViewChange?.('invoices');
        break;
      case 'task':
        onViewChange?.('tasks');
        break;
      case 'fine':
        break;
      case 'page':
        onViewChange?.(result.id);
        break;
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!isSearchOpen || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectResult(searchResults[selectedIndex]);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'vehicle': return Car;
      case 'customer': return Users;
      case 'booking': return Calendar;
      case 'invoice': return FileText;
      case 'task': return ListTodo;
      case 'fine': return AlertCircle;
      case 'page': return ArrowRight;
      default: return Search;
    }
  };

  // V4.6.86 — consolidated from 7 ad-hoc inline colors to semantic tone utilities.
  // Tonal hue now carries the *kind* of result (operational vs financial vs warning),
  // not a rainbow. Visual noise reduced; theme-aware in both modes.
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'vehicle':
      case 'customer':
        return 'sq-tone-info';
      case 'booking':
        return 'sq-tone-success';
      case 'invoice':
      case 'task':
        return 'sq-tone-warning';
      case 'fine':
        return 'sq-tone-critical';
      case 'page':
      default:
        return 'sq-tone-neutral';
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 pb-3 mb-5 border-b border-border/50 z-10 relative">
      {/* Left Section — login context (replaces breadcrumb) */}
      <div className="flex min-h-7 min-w-0 flex-1 items-center sm:flex-initial sm:shrink">
        <p
          className="truncate pr-2 text-[12px] font-normal leading-snug text-muted-foreground sm:pr-0"
          title={loggedInLabel}
        >
          {loggedInLabel}
        </p>
      </div>

      {/* Center Section - Search
          V4.7.33 — keep the established width; only reduce vertical
          height slightly so it aligns more calmly with the right actions. */}
      <div className="hidden md:flex flex-1 max-w-xs" ref={searchRef}>
        <div className="relative w-full">
          <div className="flex items-center gap-2 w-full h-7 px-3 rounded-md border bg-muted/80 border-border transition-[border-color,background-color,box-shadow] duration-200 ease-out focus-within:border-[color:var(--brand-soft)] focus-within:surface-premium focus-within:shadow-[0_0_0_3px_var(--brand-soft)]">
            <Icon name="search" className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder={t('topbar.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setIsSearchOpen(true); }}
              onFocus={() => { if (searchQuery.trim()) setIsSearchOpen(true); }}
              onKeyDown={handleSearchKeyDown}
              className="min-w-0 flex-1 bg-transparent outline-none text-[12px] placeholder:text-muted-foreground text-foreground"
            />
            {searchQuery ? (
              <button onClick={() => { setSearchQuery(''); setIsSearchOpen(false); inputRef.current?.focus(); }} className="p-0.5 rounded transition-colors hover:bg-foreground/10 text-muted-foreground hover:text-foreground">
                <Icon name="x" className="w-3 h-3" />
              </button>
            ) : (
              <div className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold font-mono tabular px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">
                <span>⌘</span><span>K</span>
              </div>
            )}
          </div>

          {/* Search Results Dropdown */}
          {isSearchOpen && searchQuery.trim() && (
            <div className="absolute top-full mt-2 left-0 right-0 z-[9999] sq-overlay overflow-hidden animate-fade-up">
              {searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Icon name="search" className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">{t('topbar.noResultsFor', { query: searchQuery })}</p>
                  <p className="text-xs mt-1 text-muted-foreground/60">{t('topbar.searchHint')}</p>
                </div>
              ) : (
                <div className="max-h-[380px] overflow-y-auto">
                  {/* Group results by category */}
                  {(() => {
                    const grouped: Record<string, typeof searchResults> = {};
                    searchResults.forEach(r => {
                      if (!grouped[r.category]) grouped[r.category] = [];
                      grouped[r.category].push(r);
                    });
                    let globalIndex = 0;
                    return Object.entries(grouped).map(([category, items]) => (
                      <div key={category}>
                        <div className="sq-section-label px-3 py-1.5 bg-muted/50">
                          {category}
                        </div>
                        {items.map((result) => {
                          const idx = globalIndex++;
                          const isSelected = selectedIndex === idx;
                          const Icon = getTypeIcon(result.type);
                          const colorClass = getTypeColor(result.type);
                          return (
                            <button
                              key={`${result.type}-${result.id}`}
                              onClick={() => handleSelectResult(result)}
                              onMouseEnter={() => setSelectedIndex(idx)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                isSelected
                                  ? 'bg-muted'
                                  : 'hover:bg-muted/50'
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-medium truncate text-foreground">{result.title}</div>
                                <div className="text-[11px] truncate text-muted-foreground">{result.subtitle}</div>
                              </div>
                              {isSelected && (
                                <div className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">
                                  ↵
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()}
                  {/* Footer */}
                  <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/40">
                    <span className="text-[10px] text-muted-foreground/60">
                      {searchResults.length === 1
                        ? t('topbar.resultCountOne')
                        : t('topbar.resultCountMany', { count: searchResults.length })}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <span className="px-1 py-0.5 rounded bg-foreground/5">↑↓</span>
                      <span>{t('topbar.keyboardNavigate')}</span>
                      <span className="px-1 py-0.5 rounded bg-foreground/5">↵</span>
                      <span>{t('topbar.keyboardSelect')}</span>
                      <span className="px-1 py-0.5 rounded bg-foreground/5">esc</span>
                      <span>{t('topbar.keyboardClose')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center gap-1 lg:gap-1.5 shrink-0">
        <OrganizationSwitcher />
        <OperatorEntryButton />

        <ThemeToggleButton preference={preference} onCycle={cycleThemePreference} />

        <LanguageSelector variant="topbar-pill" />

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 mx-1 bg-border/60" />

        {/* User Avatar — V4.6.86: brand-tinted tile, no AI gradient; subtle hover lift */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold tracking-tight transition-all duration-200 ease-out sq-tone-brand hover:-translate-y-px hover:shadow-[0_4px_12px_-4px_var(--brand-glow)] ring-1 ring-[color:var(--brand-soft)]"
            aria-label={t('topbar.profileMenuFor', { name: currentUserName })}
          >
            {currentUserInitials}
          </button>

          {/* Profile Dropdown */}
          {isProfileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 sq-overlay overflow-hidden z-[9999] animate-fade-up">
              {/* User Info Header */}
              <div className="px-3 py-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold tracking-tight shrink-0 sq-tone-brand ring-1 ring-[color:var(--brand-soft)]">
                    {currentUserInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate text-foreground">{currentUserName}</p>
                    <p className="text-[11px] truncate text-muted-foreground">{currentUserEmail}</p>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onSettingsTabChange?.('account');
                    onViewChange?.('settings');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-xs hover:bg-muted text-foreground"
                >
                  <Icon name="user" className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{t('topbar.accountSettings')}</span>
                  <Icon name="chevron-right" className="w-3 h-3 ml-auto text-muted-foreground/50" />
                </button>
              </div>

              {/* Logout */}
              <div className="border-t py-1 border-border">
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    clearAuth();
                    window.location.href = '/login';
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-xs hover:bg-destructive/10 text-destructive"
                >
                  <Icon name="log-out" className="w-3.5 h-3.5" />
                  <span>{t('topbar.logOut')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}