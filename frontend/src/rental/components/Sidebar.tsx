import { LayoutDashboard, Briefcase, DollarSign, Calendar, Car, AlertTriangle, Users, CheckSquare, FileText, AlertCircle, Tag, Settings, Building2, Wifi, MapPin, UserCog, CreditCard, Plus, Upload, ChevronDown, Bell, MessageSquare, LayoutGrid, ListTodo, Menu, X, Shield, Package, Lock, HelpCircle, Zap, Phone, Truck, Activity, Headphones, ChevronRight, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
// auth import removed — logout moved to TopBar account menu
import synqdriveLogoLight from '../../assets/synqdrive-logo-light.png';
import synqdriveLogoDark from '../../assets/synqdrive-logo-dark.png';

type SettingsTab = 'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization' | 'legal-documents';

interface SidebarProps {
  isDarkMode: boolean;
  onNewTaskClick?: () => void;
  onNewBookingClick?: () => void;
  currentView?: string;
  onViewChange?: (view: any) => void;
  settingsTab?: SettingsTab;
  onSettingsTabChange?: (tab: SettingsTab) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isDarkMode, onNewTaskClick, onNewBookingClick, currentView, onViewChange, settingsTab, onSettingsTabChange, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const { t } = useLanguage();
  const sectionForView = (view?: string): string | null => {
    if (view === 'financial-insights' || view === 'fleet-condition') return 'insights';
    if (view === 'invoices' || view === 'fines' || view === 'price-tariffs') return 'finance';
    if (view === 'tasks' || view === 'vendor-management' || view === 'vendor-detail') return 'tasks';
    if (view === 'workflow-automation' || view === 'ai-voice-assistant' || view === 'whatsapp-business') return 'automation';
    if (view === 'insurances' || view === 'parts-accessories') return 'integrations';
    if (view === 'settings') return 'administration';
    return null;
  };
  const currentSection = sectionForView(currentView);
  const [expandedSections, setExpandedSections] = useState<string[]>(() => currentSection ? [currentSection] : ['insights']);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const synqdriveLogo = isDarkMode ? synqdriveLogoDark : synqdriveLogoLight;

  // Close mobile menu on view change
  const handleViewChange = (view: any) => {
    onViewChange?.(view);
    setMobileMenuOpen(false);
  };

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // V4.7.31/V4.7.35 — keep the active parent section visible AND collapse
  // stale parent sections when navigation moves into a different category.
  // This keeps the left rail focused: at most one active upper category
  // stays open after a page change.
  useEffect(() => {
    if (!currentSection) return;
    setExpandedSections([currentSection]);
  }, [currentSection]);

  const toggleSection = (section: string) => {
    if (expandedSections.includes(section)) {
      setExpandedSections(expandedSections.filter(s => s !== section));
    } else {
      setExpandedSections([...expandedSections, section]);
    }
  };

  // V4.6.88 — Sidebar nav labels promoted to 13/600 per shared typography rules.
  // V4.6.91 — type scale tightened in left sidebar only: top-level + sub nav
  //           items both ride at 12/600 (was 13/600), section labels drop to
  //           10/900 with the preview-approved slate tint. `!` prefix is required because the unlayered
  //           `.sq-nav-rail` / `.sq-section-label` rules in theme.css outrank
  //           Tailwind utility classes.
  // Active state now picks up a slightly richer Soft-Blue-Tint surface so
  // selected sections feel branded, not just highlighted.
  const navBtnClass = (isActive: boolean) =>
    `sq-nav-rail w-full flex items-center gap-2.5 px-2.5 py-[8px] rounded-lg transition-all duration-200 ease-out !text-[12px] font-semibold tracking-[-0.003em] group ${
      isActive
        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] active ring-1 ring-[color:var(--brand-soft)] shadow-[var(--shadow-1)]'
        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:translate-x-[1px]'
    }`;

  const subNavBtnClass = (isActive: boolean) =>
    `sq-nav-rail w-full flex items-center gap-2.5 pl-4 pr-2.5 py-[7px] rounded-lg transition-all duration-200 ease-out !text-[12px] font-medium group ${
      isActive
        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] active ring-1 ring-[color:var(--brand-soft)] shadow-[var(--shadow-1)]'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:translate-x-[1px]'
    }`;

  const collapsedBtnClass = (isActive: boolean) =>
    `w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 ease-out relative group ${
      isActive
        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    }`;

  // Tooltip for collapsed items — uses overlay utility for consistent elevation
  const CollapsedTooltip = ({ label }: { label: string }) => (
    <div className="sq-overlay absolute left-full ml-2 px-2 py-1 text-[10.5px] font-medium whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-foreground">
      {label}
    </div>
  );

  const sectionLabelClass = 'sq-section-label !text-[10px] !font-black !text-[rgba(100,116,139,0.9)]';

  const sectionHeaderClass = (section: string) => {
    const isOpen = expandedSections.includes(section);
    const isActive = currentSection === section;
    return `w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer group transition-all duration-150 ${
      isActive
        ? 'bg-[color:var(--brand-soft)]/70 text-[color:var(--brand-ink)]'
        : isOpen
          ? 'bg-accent/25 text-foreground'
          : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'
    }`;
  };

  const NavSectionHeader = ({
    section,
    label,
    badge,
  }: {
    section: string;
    label: string;
    badge?: string;
  }) => {
    const isOpen = expandedSections.includes(section);
    return (
      <button onClick={() => toggleSection(section)} className={sectionHeaderClass(section)}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`${sectionLabelClass} truncate`}>{label}</span>
          {badge && (
            <span className="sq-chip sq-chip-neutral !text-[8.5px] !px-1.5 !py-[1px]">{badge}</span>
          )}
        </div>
        <ChevronRight className={`w-3 h-3 shrink-0 transition-transform duration-200 ease-out text-muted-foreground/60 ${isOpen ? 'rotate-90' : ''}`} />
      </button>
    );
  };

  // Shared desktop/mobile navigation. Keep this as a render function so React
  // does not remount the whole nav on each sidebar render and replay animations.
  const renderNavigationContent = (isMobile = false) => (
    <>
      {/* OPERATIONS Section — always visible */}
      <div className={`mb-2 flex items-center justify-between px-2.5 ${isMobile ? 'mt-3' : 'mt-1'}`}>
        <span className={sectionLabelClass}>{t('nav.operations')}</span>
      </div>

      <nav className="space-y-0.5 mb-1">
        <button onClick={() => handleViewChange('dashboard')} className={navBtnClass(currentView === 'dashboard')}>
          <LayoutDashboard className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.dashboard')}</span>
        </button>
        <button onClick={() => handleViewChange('bookings')} className={navBtnClass(currentView === 'bookings')}>
          <Calendar className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.bookings')}</span>
        </button>
        <button onClick={() => handleViewChange('fleet')} className={navBtnClass(currentView === 'fleet')}>
          <Car className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fleet')}</span>
        </button>
        <button onClick={() => handleViewChange('customers')} className={navBtnClass(currentView === 'customers')}>
          <Users className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.customers')}</span>
        </button>
        <button onClick={() => handleViewChange('stations')} className={navBtnClass(currentView === 'stations')}>
          <MapPin className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.stations')}</span>
        </button>
      </nav>

      {/* INSIGHTS Section */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="insights" label={t('nav.insights')} />
      </div>
      {expandedSections.includes('insights') && (
        <nav className="space-y-0.5 mb-1 animate-fade-up">
          {/* V4.6.93 — `Financial Insights` is the dashboard-finances replacement.
              Real `/organizations/:orgId/invoices*` data is aggregated inside
              `FinancialInsightsView`, which now lives next to the other
              insights pages instead of inside the Dashboard. */}
          <button onClick={() => handleViewChange('financial-insights')} className={subNavBtnClass(currentView === 'financial-insights')}>
            <DollarSign className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.financialInsights')}</span>
          </button>
          <button onClick={() => handleViewChange('fleet-condition')} className={subNavBtnClass(currentView === 'fleet-condition')}>
            <Activity className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fleetCondition')}</span>
          </button>
        </nav>
      )}

      {/* FINANCE Section */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="finance" label={t('nav.finance')} />
      </div>
      {expandedSections.includes('finance') && (
        <nav className="space-y-0.5 mb-1 animate-fade-up">
          <button onClick={() => handleViewChange('invoices')} className={subNavBtnClass(currentView === 'invoices')}>
            <FileText className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.invoices')}</span>
          </button>
          <button onClick={() => handleViewChange('fines')} className={subNavBtnClass(currentView === 'fines')}>
            <AlertCircle className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fines')}</span>
          </button>
          <button onClick={() => handleViewChange('price-tariffs')} className={subNavBtnClass(currentView === 'price-tariffs')}>
            <Tag className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.pricingTariffs')}</span>
          </button>
        </nav>
      )}

      {/* TASKS Section */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="tasks" label={t('nav.tasks')} />
      </div>
      {expandedSections.includes('tasks') && (
        <nav className="space-y-0.5 mb-1 animate-fade-up">
          <button onClick={() => handleViewChange('tasks')} className={subNavBtnClass(currentView === 'tasks')}>
            <ListTodo className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.taskManagement')}</span>
          </button>
          <button onClick={() => handleViewChange('vendor-management')} className={subNavBtnClass(currentView === 'vendor-management')}>
            <Briefcase className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.vendorManagement')}</span>
          </button>
        </nav>
      )}

      {/* AUTOMATION Section */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="automation" label={t('nav.automation')} />
      </div>
      {expandedSections.includes('automation') && (
        <nav className="space-y-0.5 mb-1 animate-fade-up">
          <button onClick={() => handleViewChange('workflow-automation')} className={subNavBtnClass(currentView === 'workflow-automation')}>
            <Zap className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.workflowAutomation')}</span>
          </button>
          <button onClick={() => handleViewChange('ai-voice-assistant')} className={subNavBtnClass(currentView === 'ai-voice-assistant')}>
            <MessageSquare className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.aiVoiceAssistant')}</span>
          </button>
          <button onClick={() => handleViewChange('whatsapp-business')} className={subNavBtnClass(currentView === 'whatsapp-business')}>
            <Phone className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.whatsappBusiness')}</span>
          </button>
        </nav>
      )}

      {/* INTEGRATIONS Section */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="integrations" label={t('nav.integrations')} badge={t('nav.comingSoon')} />
      </div>
      {expandedSections.includes('integrations') && (
        <nav className="space-y-0.5 mb-1 animate-fade-up">
          <button onClick={() => handleViewChange('insurances')} className={subNavBtnClass(currentView === 'insurances')}>
            <Shield className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.insurance')}</span>
          </button>
          <button onClick={() => handleViewChange('parts-accessories')} className={subNavBtnClass(currentView === 'parts-accessories')}>
            <Package className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.partsAccessories')}</span>
          </button>
          <button className={`${subNavBtnClass(false)} opacity-50 cursor-not-allowed`} disabled>
            <CreditCard className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fuelCards')}</span>
            <span className="ml-auto sq-chip sq-chip-neutral !text-[8.5px] !px-1.5 !py-[1px]">{t('nav.soon')}</span>
          </button>
          <button className={`${subNavBtnClass(false)} opacity-50 cursor-not-allowed`} disabled>
            <Truck className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.vehicleBrokerage')}</span>
            <span className="ml-auto sq-chip sq-chip-neutral !text-[8.5px] !px-1.5 !py-[1px]">{t('nav.soon')}</span>
          </button>
        </nav>
      )}

      {/* ADMINISTRATION Section */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="administration" label={t('nav.administration')} />
      </div>
      {expandedSections.includes('administration') && (
        <nav className="space-y-0.5 mb-1 animate-fade-up">
          <button onClick={() => { onSettingsTabChange?.('account'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'account')}>
            <User className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.accountInfo')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('company'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'company')}>
            <Building2 className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.companyInfo')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('users'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'users')}>
            <UserCog className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.usersRoles')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('fleet-connection'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'fleet-connection')}>
            <Wifi className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fleetConnectivity')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('data-authorization'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'data-authorization')}>
            <Lock className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.dataAuthorization')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('legal-documents'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'legal-documents')}>
            <FileText className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.legalDocuments')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('billing'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'billing')}>
            <CreditCard className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.billingSubscription')}</span>
          </button>
        </nav>
      )}

      {/* SUPPORT */}
      <div className="mt-5 mb-1.5">
        <button onClick={() => handleViewChange('support')} className={navBtnClass(currentView === 'support')}>
          <Headphones className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.support')}</span>
        </button>
        <button onClick={() => handleViewChange('help-center')} className={navBtnClass(currentView === 'help-center')}>
          <HelpCircle className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.helpCenter')}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-border/60" />

      {/* Quick Actions — V4.6.86: replaces 4 AI-gradient buttons with a primary brand CTA
          + restrained neo-press secondary tiles. Hierarchy is now clear: one primary,
          one positive, two neutral. */}
      <div className="pb-2">
        <div className={`${sectionLabelClass} mb-2 px-1 text-center`}>
          {t('nav.quickActions')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {/* New Booking — primary brand CTA */}
          <button
            onClick={() => { onNewBookingClick?.(); setMobileMenuOpen(false); }}
            className="sq-3d-btn sq-3d-btn--primary group flex items-center gap-1.5 px-2 py-2 rounded-lg text-[10.5px] font-semibold"
          >
            <span className="icon-wrapper w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0 transition-all duration-200">
              <Plus className="w-3 h-3" />
            </span>
            <span className="truncate">{t('nav.newBooking')}</span>
          </button>

          {/* New Task — positive tonal action */}
          <button
            onClick={() => { onNewTaskClick?.(); setMobileMenuOpen(false); }}
            className="sq-3d-btn sq-3d-btn--success group flex items-center gap-1.5 px-2 py-2 rounded-lg text-[10.5px] font-semibold"
          >
            <span className="icon-wrapper w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0 transition-all duration-200">
              <CheckSquare className="w-3 h-3" />
            </span>
            <span className="truncate">{t('nav.newTask')}</span>
          </button>

          {/* Upload Document — neutral neo-press */}
          <button
            onClick={() => handleViewChange('document-upload')}
            className={`sq-3d-btn sq-3d-btn--neutral group flex items-center gap-1.5 px-2 py-2 rounded-lg text-[10.5px] font-medium ${currentView === 'document-upload' ? 'active' : ''}`}
          >
            <span className="icon-wrapper w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0 transition-all duration-200">
              <Upload className="w-3 h-3" />
            </span>
            <span className="truncate">{t('nav.upload')}</span>
          </button>

          {/* AI Fleet Assistant — brand-tinted neo-press (replaces purple gradient) */}
          <button
            onClick={() => handleViewChange('ai-assistant')}
            className={`sq-3d-btn sq-3d-btn--ai group flex items-center gap-1.5 px-2 py-2 rounded-lg text-[10.5px] font-medium ${currentView === 'ai-assistant' ? 'active' : ''}`}
          >
            <span className="icon-wrapper w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0 transition-all duration-200">
              <MessageSquare className="w-3 h-3" />
            </span>
            <span className="truncate">{t('nav.aiAssistant')}</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ===== MOBILE TOP BAR ===== */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b bg-sidebar border-sidebar-border">
        {/* Top Bar Row */}
        <div className="flex items-center justify-between h-16 px-4">
          {/* Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2.5 rounded-md transition-all duration-150 hover:bg-accent text-muted-foreground"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Centered Logo */}
          <img
            src={synqdriveLogo}
            alt="SYNQDRIVE"
            className="h-[25px] w-auto object-contain"
          />

          {/* Spacer for symmetry */}
          <div className="w-10" />
        </div>

        {/* Collapsible Mobile Navigation */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            mobileMenuOpen ? 'max-h-[calc(100vh-4rem)] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div
            className="px-3 pb-6 overflow-y-auto border-t border-sidebar-border"
            style={{ maxHeight: 'calc(100vh - 4rem)' }}
          >
            {renderNavigationContent(true)}
          </div>
        </div>
      </div>

      {/* Mobile backdrop overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setMobileMenuOpen(false)}
          style={{ top: '4rem' }}
        />
      )}

      {/* ===== DESKTOP SIDEBAR ===== */}
      <div className={`hidden lg:flex h-screen border-r border-sidebar-border flex-col shrink-0 transition-all duration-300 ease-in-out bg-sidebar ${
        isCollapsed ? 'w-[52px]' : 'w-[260px]'
      }`}>
        {!isCollapsed && (
          <div className="relative flex items-center justify-center border-b border-sidebar-border transition-all duration-300 shrink-0 px-[30px] py-[30px]">
            {/* V4.6.90 — refreshed SYNQDRIVE wordmark (new iconic X-badge + larger type weight)
                has an aspect ratio of ~5.7:1 (1024x180). h-[27px] keeps the horizontal footprint
                at ~154px so the brand row stays visually identical to the previous logo inside
                the 260px sidebar. */}
            <img src={synqdriveLogo} alt="SYNQDRIVE" className="h-[27px] w-auto object-contain" />
          </div>
        )}

        {/* Navigation */}
        {isCollapsed ? (
          /* Collapsed: icon-only navigation */
          <div className="flex-1 overflow-y-auto py-3 flex flex-col items-center"
            style={{
              scrollbarWidth: 'none',
            }}
          >
            <nav className="space-y-0.5 w-full flex flex-col items-center">
              {/* Main nav icons */}
              <button onClick={() => handleViewChange('dashboard')} className={collapsedBtnClass(currentView === 'dashboard')}>
                <LayoutDashboard className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.dashboard')} />
              </button>
              <button onClick={() => handleViewChange('bookings')} className={collapsedBtnClass(currentView === 'bookings')}>
                <Calendar className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.bookings')} />
              </button>
              <button onClick={() => handleViewChange('fleet')} className={collapsedBtnClass(currentView === 'fleet')}>
                <Car className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.fleet')} />
              </button>
              <button onClick={() => handleViewChange('customers')} className={collapsedBtnClass(currentView === 'customers')}>
                <Users className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.customers')} />
              </button>
              <button onClick={() => handleViewChange('stations')} className={collapsedBtnClass(currentView === 'stations')}>
                <MapPin className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.stations')} />
              </button>

              {/* Divider */}
              <div className={`w-4 h-px my-1.5 bg-border`} />

              {/* Insights */}
              <button onClick={() => handleViewChange('financial-insights')} className={collapsedBtnClass(currentView === 'financial-insights')}>
                <DollarSign className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.financialInsights')} />
              </button>
              <button onClick={() => handleViewChange('fleet-condition')} className={collapsedBtnClass(currentView === 'fleet-condition')}>
                <Activity className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.fleetCondition')} />
              </button>

              {/* Divider */}
              <div className={`w-4 h-px my-1.5 bg-border`} />

              {/* Finance */}
              <button onClick={() => handleViewChange('invoices')} className={collapsedBtnClass(currentView === 'invoices')}>
                <FileText className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.invoices')} />
              </button>
              <button onClick={() => handleViewChange('fines')} className={collapsedBtnClass(currentView === 'fines')}>
                <AlertCircle className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.fines')} />
              </button>
              <button onClick={() => handleViewChange('price-tariffs')} className={collapsedBtnClass(currentView === 'price-tariffs')}>
                <Tag className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.pricingTariffs')} />
              </button>

              {/* Divider */}
              <div className={`w-4 h-px my-1.5 bg-border`} />

              {/* Tasks */}
              <button onClick={() => handleViewChange('tasks')} className={collapsedBtnClass(currentView === 'tasks')}>
                <ListTodo className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.taskManagement')} />
              </button>

              {/* Divider */}
              <div className={`w-4 h-px my-1.5 bg-border`} />

              {/* Admin */}
              <button onClick={() => { onSettingsTabChange?.('company'); handleViewChange('settings'); }} className={collapsedBtnClass(currentView === 'settings')}>
                <Settings className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.administration')} />
              </button>

              {/* Support */}
              <button onClick={() => handleViewChange('support')} className={collapsedBtnClass(currentView === 'support')}>
                <Headphones className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.support')} />
              </button>
            </nav>

            {/* Collapsed Quick Actions — V4.6.86: brand CTA + success tone */}
            <div className="mt-auto pt-3 w-full flex flex-col items-center gap-1.5 border-t border-sidebar-border">
              <button
                onClick={() => onNewBookingClick?.()}
                className="sq-3d-btn sq-3d-btn--primary w-8 h-8 rounded-lg flex items-center justify-center relative group"
                aria-label={t('nav.newBooking')}
              >
                <Plus className="w-3.5 h-3.5" />
                <CollapsedTooltip label={t('nav.newBooking')} />
              </button>
              <button
                onClick={() => onNewTaskClick?.()}
                className="sq-3d-btn sq-3d-btn--success w-8 h-8 rounded-lg flex items-center justify-center relative group"
                aria-label={t('nav.newTask')}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <CollapsedTooltip label={t('nav.newTask')} />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded: full navigation */
          <div className="flex-1 overflow-y-auto px-[18px] py-4 scrollbar-thin scrollbar-thumb-gray-300/50 scrollbar-track-transparent"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: isDarkMode ? 'rgba(100,100,100,0.3) transparent' : 'rgba(209, 213, 219, 0.5) transparent'
            }}
          >
            <div className="max-w-[260px] mx-auto">
              {renderNavigationContent()}
            </div>
          </div>
        )}

        <div className={`sq-sidebar-footer shrink-0 ${isCollapsed ? 'px-2 py-3' : 'px-[18px] py-3'}`}>
          <button
            onClick={onToggleCollapse}
            className={`sq-sidebar-footer__toggle ${isCollapsed ? 'sq-sidebar-footer__toggle--icon-only relative group' : ''}`}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="sq-sidebar-footer__icon">
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </span>
            {!isCollapsed && <span className="sq-sidebar-footer__label">Collapse</span>}
            {isCollapsed && <CollapsedTooltip label="Expand sidebar" />}
          </button>
        </div>
      </div>
    </>
  );
}