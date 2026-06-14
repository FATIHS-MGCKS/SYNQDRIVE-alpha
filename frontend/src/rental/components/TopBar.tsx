
import { AlertCircle, ArrowRight, Briefcase, Calendar, Car, FileText, Home, ListTodo, MapPin, Search, Settings, Tag, Users } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { clearAuth, getStoredUser } from '../../lib/auth';
import { VehicleData } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { useLanguage, type Locale } from '../i18n/LanguageContext';

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

type ViewType = 'overview' | 'trips' | 'dashboard' | 'bookings' | 'health-errors' | 'fleet' | 'damages' | 'documents' | 'customers' | 'customer-detail' | 'tasks' | 'vendor-management' | 'vendor-detail' | 'invoices' | 'fines' | 'price-tariffs' | 'fleet-condition' | 'financial-insights' | 'settings' | 'new-booking' | 'stations' | 'document-upload' | 'ai-assistant' | 'ai-voice-assistant' | 'support';
type SettingsTab = 'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization' | 'legal-documents';

interface TopBarProps {
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  currentView?: string;
  settingsTab?: SettingsTab;
  selectedVehicle?: VehicleData | null;
  activeBookingRef?: string | null;
  detailCustomerId?: string | null;
  onViewChange?: (view: any) => void;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onSettingsTabChange?: (tab: SettingsTab) => void;
  onFinanceTabChange?: (tab: any) => void;
  onTasksTabChange?: (tab: any) => void;
}

import type { TranslationKey } from '../i18n/translations/en';

const viewLabelKeys: Record<ViewType, TranslationKey> = {
  'overview': 'view.overview',
  'trips': 'view.trips',
  'dashboard': 'view.dashboard',
  'bookings': 'view.bookings',
  'health-errors': 'view.healthErrors',
  'fleet': 'view.fleet',
  'damages': 'view.damages',
  'documents': 'view.documents',
  'customers': 'view.customers',
  'customer-detail': 'view.customerDetail',
  'tasks': 'view.tasks',
  'vendor-management': 'view.vendorManagement',
  'vendor-detail': 'view.vendorManagement',
  'invoices': 'view.invoices',
  'fines': 'view.fines',
  'price-tariffs': 'view.priceTariffs',
  'fleet-condition': 'view.fleetCondition',
  'financial-insights': 'nav.financialInsights',
  'settings': 'view.settings',
  'new-booking': 'view.newBooking',
  'stations': 'view.stations',
  'document-upload': 'view.documentUpload',
  'ai-assistant': 'view.aiAssistant',
  'ai-voice-assistant': 'view.aiVoiceAssistant',
  'support': 'view.support',
};

const viewCategoryKeys: Record<ViewType, TranslationKey> = {
  'overview': 'category.operations',
  'trips': 'category.operations',
  'health-errors': 'category.operations',
  'damages': 'category.operations',
  'documents': 'category.operations',
  'dashboard': 'category.operations',
  'bookings': 'category.operations',
  'fleet': 'category.operations',
  'customers': 'category.operations',
  'customer-detail': 'category.operations',
  'tasks': 'category.tasks',
  'vendor-management': 'category.tasks',
  'vendor-detail': 'category.tasks',
  'invoices': 'category.finance',
  'fines': 'category.finance',
  'price-tariffs': 'category.finance',
  'fleet-condition': 'category.insights',
  'financial-insights': 'category.insights',
  'settings': 'category.administration',
  'new-booking': 'category.operations',
  'stations': 'category.operations',
  'document-upload': 'category.operations',
  'ai-assistant': 'category.operations',
  'ai-voice-assistant': 'category.operations',
  'support': 'category.support',
};

const settingsTabKeys: Record<SettingsTab, TranslationKey> = {
  'account': 'settingsTab.account',
  'company': 'settingsTab.company',
  'fleet-connection': 'settingsTab.fleetConnection',
  'users': 'settingsTab.users',
  'billing': 'settingsTab.billing',
  'data-authorization': 'settingsTab.dataAuthorization',
  'legal-documents': 'settingsTab.legalDocuments',
};

export function TopBar({ isDarkMode, setIsDarkMode, currentView = 'overview', settingsTab, selectedVehicle, activeBookingRef, detailCustomerId, onViewChange, onVehicleSelect, onSettingsTabChange, onFinanceTabChange, onTasksTabChange }: TopBarProps) {
  const { locale, setLocale, t } = useLanguage();
  const { fleetVehicles } = useFleetVehicles();
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

  const resolvedView = Object.prototype.hasOwnProperty.call(viewLabelKeys, currentView)
    ? (currentView as ViewType)
    : 'dashboard';

  // Mock searchable data
  const mockCustomers = [
    { id: 'c1', name: 'Alexander Schmidt', email: 'a.schmidt@email.de', license: 'B-AS-1234' },
    { id: 'c2', name: 'Maria Weber', email: 'm.weber@email.de', license: 'M-MW-5678' },
    { id: 'c3', name: 'Thomas Müller', email: 't.mueller@email.de', license: 'HH-TM-9012' },
    { id: 'c4', name: 'Sophie Fischer', email: 's.fischer@email.de', license: 'K-SF-3456' },
    { id: 'c5', name: 'Lukas Becker', email: 'l.becker@email.de', license: 'S-LB-7890' },
  ];

  const mockBookings = [
    { id: 'BK-2026-001', customer: 'Alexander Schmidt', vehicle: 'Mercedes AMG GT', status: 'Active' },
    { id: 'BK-2026-002', customer: 'Maria Weber', vehicle: 'VW Touareg', status: 'Reserved' },
    { id: 'BK-2026-003', customer: 'Thomas Müller', vehicle: 'Tesla Model S', status: 'Completed' },
    { id: 'BK-2026-004', customer: 'Sophie Fischer', vehicle: 'Hyundai Tucson', status: 'Active' },
  ];

  const mockInvoices = [
    { id: 'INV-2026-0041', customer: 'Alexander Schmidt', amount: '€1,240.00', status: 'Paid' },
    { id: 'INV-2026-0042', customer: 'Maria Weber', amount: '€890.50', status: 'Open' },
    { id: 'INV-2026-0043', customer: 'Thomas Müller', amount: '€2,150.00', status: 'Overdue' },
  ];

  const mockTasks = [
    { id: 'TSK-001', title: 'Oil Change — Mercedes AMG GT', priority: 'High', status: 'Open' },
    { id: 'TSK-002', title: 'Tire Rotation — VW Touareg', priority: 'Medium', status: 'In Progress' },
    { id: 'TSK-003', title: 'Interior Cleaning — Tesla Model S', priority: 'Low', status: 'Open' },
    { id: 'TSK-004', title: 'Brake Inspection — Hyundai Tucson', priority: 'High', status: 'Overdue' },
  ];

  const mockFines = [
    { id: 'FINE-001', vehicle: 'Mercedes AMG GT', amount: '€35.00', reason: 'Parking violation' },
    { id: 'FINE-002', vehicle: 'VW Touareg', amount: '€120.00', reason: 'Speed limit exceeded' },
  ];

  const navigationItems = [
    { view: 'dashboard' as ViewType, label: 'Dashboard', icon: Home, category: 'Operations' },
    { view: 'bookings' as ViewType, label: 'Bookings', icon: Calendar, category: 'Operations' },
    { view: 'fleet' as ViewType, label: 'Fleet', icon: Car, category: 'Operations' },
    { view: 'customers' as ViewType, label: 'Customers', icon: Users, category: 'Operations' },
    { view: 'stations' as ViewType, label: 'Stations', icon: MapPin, category: 'Operations' },
    { view: 'invoices' as ViewType, label: 'Invoices', icon: FileText, category: 'Finance' },
    { view: 'fines' as ViewType, label: 'Fines & OCR', icon: AlertCircle, category: 'Finance' },
    { view: 'price-tariffs' as ViewType, label: 'Pricing & Tariffs', icon: Tag, category: 'Finance' },
    { view: 'tasks' as ViewType, label: 'Task Management', icon: ListTodo, category: 'Tasks' },
    { view: 'vendor-management' as ViewType, label: 'Vendor Management', icon: Briefcase, category: 'Tasks' },
    { view: 'settings' as ViewType, label: 'Settings', icon: Settings, category: 'Administration' },
  ];

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

    // Customers
    mockCustomers.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.license.toLowerCase().includes(q)) {
        results.push({ type: 'customer', id: c.id, title: c.name, subtitle: `${c.email} · ${c.license}`, category: 'Customers' });
      }
    });

    // Bookings
    mockBookings.forEach(b => {
      if (b.id.toLowerCase().includes(q) || b.customer.toLowerCase().includes(q) || b.vehicle.toLowerCase().includes(q)) {
        results.push({ type: 'booking', id: b.id, title: b.id, subtitle: `${b.customer} · ${b.vehicle} · ${b.status}`, category: 'Bookings' });
      }
    });

    // Invoices
    mockInvoices.forEach(inv => {
      if (inv.id.toLowerCase().includes(q) || inv.customer.toLowerCase().includes(q) || inv.amount.toLowerCase().includes(q)) {
        results.push({ type: 'invoice', id: inv.id, title: inv.id, subtitle: `${inv.customer} · ${inv.amount} · ${inv.status}`, category: 'Invoices' });
      }
    });

    // Tasks
    mockTasks.forEach(t => {
      if (t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)) {
        results.push({ type: 'task', id: t.id, title: t.title, subtitle: `${t.priority} · ${t.status}`, category: 'Tasks' });
      }
    });

    // Fines
    mockFines.forEach(f => {
      if (f.vehicle.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.reason.toLowerCase().includes(q)) {
        results.push({ type: 'fine', id: f.id, title: f.reason, subtitle: `${f.vehicle} · ${f.amount}`, category: 'Fines' });
      }
    });

    // Pages/Navigation
    navigationItems.forEach(nav => {
      if (nav.label.toLowerCase().includes(q) || nav.category.toLowerCase().includes(q)) {
        results.push({ type: 'page', id: nav.view, title: nav.label, subtitle: nav.category, category: 'Pages' });
      }
    });

    return results.slice(0, 12);
  }, [searchQuery]);

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
        onTasksTabChange?.('tasks');
        onViewChange?.('tasks');
        break;
      case 'fine':
        onFinanceTabChange?.('fines');
        onViewChange?.('fines');
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
      {/* Left Section - Breadcrumb Navigation */}
      <div className="flex items-center gap-1.5 lg:gap-2 text-[11px] min-w-0 overflow-hidden">
        <Icon name="home" className="w-3 h-3 shrink-0 text-muted-foreground" />
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        <span className="hidden sm:inline text-muted-foreground">{t(viewCategoryKeys[resolvedView])}</span>
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        {currentView === 'settings' && settingsTab ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t('view.settings')}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{t(settingsTabKeys[settingsTab])}</span>
          </>
        ) : ['invoices', 'fines', 'price-tariffs'].includes(currentView) ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t('category.finance')}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{t(viewLabelKeys[resolvedView])}</span>
          </>
        ) : ['tasks', 'vendor-management', 'vendor-detail'].includes(currentView) ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t('category.tasks')}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{t(viewLabelKeys[resolvedView])}</span>
          </>
        ) : ['fleet-condition', 'financial-insights'].includes(currentView) ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t('category.insights')}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{t(viewLabelKeys[resolvedView])}</span>
          </>
        ) : currentView === 'new-booking' ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t('view.bookings')}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{t('view.newBooking')}</span>
          </>
        ) : currentView === 'customer-detail' && detailCustomerId ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t('view.customers')}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold font-mono truncate text-foreground">{detailCustomerId}</span>
          </>
        ) : currentView === 'bookings' && activeBookingRef ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t('view.bookings')}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{activeBookingRef}</span>
          </>
        ) : ['overview', 'trips', 'health-errors', 'damages', 'documents'].includes(currentView) && selectedVehicle ? (
          <>
            <span className="hidden md:inline text-muted-foreground">{t(viewLabelKeys[resolvedView])}</span>
            <span className="hidden md:inline text-muted-foreground/40">/</span>
            <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{selectedVehicle.model}</span>
          </>
        ) : (
          <span className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">{t(viewLabelKeys[resolvedView])}</span>
        )}
      </div>

      {/* Center Section - Search
          V4.7.33 — keep the established width; only reduce vertical
          height slightly so it aligns more calmly with the right actions. */}
      <div className="hidden md:flex flex-1 max-w-xs" ref={searchRef}>
        <div className="relative w-full">
          <div className="flex items-center gap-2 w-full h-7 px-3 rounded-md border bg-muted/80 border-border transition-[border-color,background-color,box-shadow] duration-200 ease-out focus-within:border-[color:var(--brand-soft)] focus-within:bg-card focus-within:shadow-[0_0_0_3px_var(--brand-soft)]">
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
        {/* Dark Mode Toggle — V4.6.86: soft press + subtle rotation micro-motion */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 ease-out hover:bg-muted text-muted-foreground hover:text-foreground sq-press"
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? (
            <Icon name="sun" className="w-4 h-4 transition-transform duration-300 ease-out hover:rotate-45" />
          ) : (
            <Icon name="moon" className="w-4 h-4 transition-transform duration-300 ease-out hover:-rotate-12" />
          )}
        </button>

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