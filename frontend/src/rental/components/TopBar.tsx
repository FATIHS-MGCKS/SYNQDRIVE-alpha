
import { AlertCircle, ArrowRight, Calendar, Car, DollarSign, FileText, Home, ListTodo, MapPin, Search, Settings, Tag, Users } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { clearAuth, getStoredUser } from '../../lib/auth';
import { formatTopBarWelcomeLabel } from '../../lib/topbarUserLabel';
import { VehicleData } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { useLanguage, type Locale } from '../i18n/LanguageContext';
import { api } from '../../lib/api';
import { unwrapTaskListPage } from '../../lib/tasks-pagination';
import { OperatorEntryButton } from '../../operator/components/OperatorEntryButton';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { useAppTheme } from '../../context/AppThemeContext';
import type { SettingsTabInput } from './settings/settingsTypes';

// V4.6.86 — flags replaced with ISO-2 code pills (anti-emoji, per design direction).
const languages = [
  { code: 'en' as Locale, name: 'English', short: 'EN' },
  { code: 'de' as Locale, name: 'Deutsch', short: 'DE' },
  { code: 'fr' as Locale, name: 'Français', short: 'FR' },
  { code: 'nl' as Locale, name: 'Nederlands', short: 'NL' },
  { code: 'es' as Locale, name: 'Español', short: 'ES' },
  { code: 'it' as Locale, name: 'Italiano', short: 'IT' },
  { code: 'pl' as Locale, name: 'Polski', short: 'PL' },
  { code: 'cs' as Locale, name: 'Čeština', short: 'CS' },
];

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
  const { locale, setLocale, t } = useLanguage();
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(() => languages.find(l => l.code === locale) || languages[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentUser = getStoredUser();
  const currentUserName = currentUser?.name || currentUser?.email || 'User';
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

  const navigationItems = [
    { view: 'dashboard', label: 'Dashboard', icon: Home, category: 'Operations' },
    { view: 'bookings', label: 'Bookings', icon: Calendar, category: 'Operations' },
    { view: 'customers', label: 'Customers', icon: Users, category: 'Operations' },
    { view: 'stations', label: 'Stations', icon: MapPin, category: 'Operations' },
    { view: 'tasks', label: 'Tasks', icon: ListTodo, category: 'Operations' },
    { view: 'fleet', label: 'Fleet', icon: Car, category: 'Fleet' },
    { view: 'financial-insights', label: 'Insights', icon: DollarSign, category: 'Finance' },
    { view: 'invoices', label: 'Invoices', icon: FileText, category: 'Finance' },
    { view: 'price-tariffs', label: 'Price Tariffs', icon: Tag, category: 'Finance' },
    { view: 'settings', label: 'Settings', icon: Settings, category: 'Administration' },
  ] as const;

  // Build search results
  type SearchResult = { type: 'vehicle' | 'customer' | 'booking' | 'invoice' | 'task' | 'fine' | 'page'; id: string; title: string; subtitle: string; category: string; data?: any };

  const getSearchResults = useCallback((): SearchResult[] => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    // Vehicles
    fleetVehicles.forEach(v => {
      if (v.model.toLowerCase().includes(q) || v.license.toLowerCase().includes(q) || v.station.toLowerCase().includes(q)) {
        results.push({ type: 'vehicle', id: v.id, title: v.model, subtitle: `${v.license} · ${v.status} · ${v.station}`, category: 'Vehicles', data: v });
      }
    });

    // Customers (org-scoped API, client-filtered)
    searchCustomers.forEach(c => {
      const name = c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
      const email = c.email ?? '';
      const license = c.licenseNumber ?? c.license ?? '';
      const haystack = [name, email, license].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'customer', id: c.id, title: name || email || c.id, subtitle: [email, license].filter(Boolean).join(' · '), category: 'Customers' });
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
        results.push({ type: 'booking', id: b.id, title: String(ref), subtitle: [customer, vehicle, status].filter(Boolean).join(' · '), category: 'Bookings' });
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
        results.push({ type: 'invoice', id: inv.id, title: String(ref), subtitle: [customer, amount, status].filter(Boolean).join(' · '), category: 'Invoices' });
      }
    });

    // Tasks
    searchTasks.forEach(t => {
      const title = t.title ?? '';
      const priority = t.priority ?? '';
      const status = t.status ?? '';
      const haystack = [title, t.id, priority, status].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'task', id: t.id, title, subtitle: [priority, status].filter(Boolean).join(' · '), category: 'Tasks' });
      }
    });

    // Fines
    searchFines.forEach(f => {
      const reason = f.title ?? f.reason ?? f.offenseType ?? 'Fine';
      const vehicle = f.vehicleLabel ?? f.vehicleId ?? '';
      const amount = f.amountCents != null ? `€${(f.amountCents / 100).toFixed(2)}` : '';
      const haystack = [reason, vehicle, f.id].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ type: 'fine', id: f.id, title: reason, subtitle: [vehicle, amount].filter(Boolean).join(' · '), category: 'Fines' });
      }
    });

    // Pages/Navigation
    navigationItems.forEach(nav => {
      if (nav.label.toLowerCase().includes(q) || nav.category.toLowerCase().includes(q)) {
        results.push({ type: 'page', id: nav.view, title: nav.label, subtitle: nav.category, category: 'Pages' });
      }
    });

    return results.slice(0, 12);
  }, [searchQuery, fleetVehicles, searchCustomers, searchBookings, searchInvoices, searchTasks, searchFines]);

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
                  <p className="text-sm font-medium text-muted-foreground">No results for "{searchQuery}"</p>
                  <p className="text-xs mt-1 text-muted-foreground/60">Try searching for vehicles, customers, bookings...</p>
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
                    <span className="text-[10px] text-muted-foreground/60">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      <span className="px-1 py-0.5 rounded bg-foreground/5">↑↓</span>
                      <span>navigate</span>
                      <span className="px-1 py-0.5 rounded bg-foreground/5">↵</span>
                      <span>select</span>
                      <span className="px-1 py-0.5 rounded bg-foreground/5">esc</span>
                      <span>close</span>
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
        <OperatorEntryButton />

        <ThemeToggleButton preference={preference} onCycle={cycleThemePreference} />

        {/* Language Selector — ISO-code pill (V4.6.86: anti-emoji) */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setIsLanguageOpen(!isLanguageOpen)}
            className="flex items-center justify-center h-8 min-w-[36px] px-2 rounded-md text-[10.5px] font-semibold tracking-[0.06em] font-mono tabular transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-muted sq-press"
            aria-label={`Language: ${selectedLanguage.name}`}
          >
            {selectedLanguage.short}
          </button>

          {/* Language Dropdown */}
          {isLanguageOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 sq-overlay overflow-hidden z-[9999] animate-fade-up">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setSelectedLanguage(lang);
                    setLocale(lang.code);
                    setIsLanguageOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-[12.5px] hover:bg-muted ${
                    selectedLanguage.code === lang.code ? 'bg-muted' : ''
                  }`}
                >
                  <span className="inline-flex items-center justify-center h-5 min-w-[28px] px-1.5 rounded-sm text-[10px] font-semibold tracking-[0.06em] font-mono tabular bg-muted text-muted-foreground">
                    {lang.short}
                  </span>
                  <span className="text-foreground">{lang.name}</span>
                  {selectedLanguage.code === lang.code && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand" aria-hidden />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 mx-1 bg-border/60" />

        {/* User Avatar — V4.6.86: brand-tinted tile, no AI gradient; subtle hover lift */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold tracking-tight transition-all duration-200 ease-out sq-tone-brand hover:-translate-y-px hover:shadow-[0_4px_12px_-4px_var(--brand-glow)] ring-1 ring-[color:var(--brand-soft)]"
            aria-label={`Open profile menu for ${currentUserName}`}
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