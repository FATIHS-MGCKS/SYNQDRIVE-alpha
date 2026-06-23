import { LayoutDashboard, DollarSign, Calendar, Car, Users, CheckSquare, FileText, Tag, Settings, Building2, Wifi, MapPin, UserCog, CreditCard, Plus, Upload, Menu, X, Shield, ShieldCheck, Package, Lock, HelpCircle, Zap, Phone, Truck, Headphones, ChevronRight, User, PanelLeftClose, PanelLeftOpen, ListTodo, MessageSquare, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useRentalOrg } from '../RentalContext';
import type { FleetTab } from './FleetHubView';
import {
  navItemClass,
  subNavItemClass,
  navSectionHeaderClass,
  navSectionLabelClass,
  CollapsedNavTooltip,
  NavComingSoonBadge,
} from '../../components/shell';
import synqdriveLogoLight from '../../assets/synqdrive-logo-light.png';
import synqdriveLogoDark from '../../assets/synqdrive-logo-dark.png';

type SettingsTab = 'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization' | 'legal-documents' | 'rental-rules';

interface SidebarProps {
  onNewTaskClick?: () => void;
  onNewBookingClick?: () => void;
  currentView?: string;
  onViewChange?: (view: any) => void;
  onFleetTabChange?: (tab: FleetTab) => void;
  settingsTab?: SettingsTab;
  onSettingsTabChange?: (tab: SettingsTab) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  supportUnreadCount?: number;
}

export function Sidebar({ onNewTaskClick, onNewBookingClick, currentView, onViewChange, onFleetTabChange, settingsTab, onSettingsTabChange, isCollapsed = false, onToggleCollapse, supportUnreadCount = 0 }: SidebarProps) {
  const { t } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const canDataAnalyse = hasPermission('data-analyse', 'read');
  const isFleetActive =
    currentView === 'fleet' ||
    currentView === 'fleet-condition-detail' ||
    currentView === 'vendor-detail';

  const sectionForView = (view?: string): string | null => {
    if (view === 'financial-insights' || view === 'invoices' || view === 'price-tariffs') return 'finance';
    if (view === 'workflow-automation' || view === 'ai-voice-assistant' || view === 'whatsapp-business') return 'automation';
    if (view === 'insurances' || view === 'parts-accessories') return 'integrations';
    if (view === 'settings') return 'administration';
    return null;
  };
  const currentSection = sectionForView(currentView);
  const [expandedSections, setExpandedSections] = useState<string[]>(() => currentSection ? [currentSection] : ['finance']);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const SynqLogo = ({ className }: { className?: string }) => (
    <>
      <img src={synqdriveLogoLight} alt="SYNQDRIVE" className={`dark:hidden ${className ?? ''}`} />
      <img src={synqdriveLogoDark} alt="SYNQDRIVE" className={`hidden dark:block ${className ?? ''}`} />
    </>
  );

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

  // Active state uses brand-soft surface (see nav-primitives).
  const navBtnClass = (isActive: boolean) => navItemClass(isActive);
  const subNavBtnClass = (isActive: boolean) => subNavItemClass(isActive);
  const collapsedBtnClass = (isActive: boolean) => navItemClass(isActive, true);
  const CollapsedTooltip = CollapsedNavTooltip;
  const sectionLabelClass = navSectionLabelClass;
  const sectionHeaderClass = (section: string) => {
    const isOpen = expandedSections.includes(section);
    const isActive = currentSection === section;
    return navSectionHeaderClass(isOpen, isActive);
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
  const handleFleetNav = () => {
    onFleetTabChange?.('status');
    handleViewChange('fleet');
  };

  const renderNavigationContent = (isMobile = false) => (
    <>
      {/* Primary navigation */}
      <nav className={`space-y-0.5 mb-1 ${isMobile ? 'mt-3' : 'mt-1'}`}>
        <button onClick={() => handleViewChange('dashboard')} className={navBtnClass(currentView === 'dashboard')}>
          <LayoutDashboard className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.dashboard')}</span>
        </button>
        <button onClick={() => handleViewChange('bookings')} className={navBtnClass(currentView === 'bookings')}>
          <Calendar className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.bookings')}</span>
        </button>
        <button onClick={() => handleViewChange('customers')} className={navBtnClass(currentView === 'customers' || currentView === 'customer-detail')}>
          <Users className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.customers')}</span>
        </button>
        <button onClick={() => handleViewChange('stations')} className={navBtnClass(currentView === 'stations' || currentView === 'station-detail')}>
          <MapPin className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.stations')}</span>
        </button>
        <button onClick={() => handleViewChange('tasks')} className={navBtnClass(currentView === 'tasks')}>
          <ListTodo className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.tasks')}</span>
        </button>
        <button onClick={handleFleetNav} className={navBtnClass(isFleetActive)}>
          <Car className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fleet')}</span>
        </button>
      </nav>

      {/* FINANCE */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="finance" label={t('nav.finance')} />
      </div>
      {expandedSections.includes('finance') && (
        <nav className="space-y-0.5 mb-1 animate-fade-up">
          <button onClick={() => handleViewChange('financial-insights')} className={subNavBtnClass(currentView === 'financial-insights')}>
            <DollarSign className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.financialInsights')}</span>
          </button>
          <button onClick={() => handleViewChange('invoices')} className={subNavBtnClass(currentView === 'invoices')}>
            <FileText className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.invoices')}</span>
          </button>
          <button onClick={() => handleViewChange('price-tariffs')} className={subNavBtnClass(currentView === 'price-tariffs')}>
            <Tag className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.pricingTariffs')}</span>
          </button>
        </nav>
      )}

      {/* AUTOMATION */}
      <div className="mt-5 mb-1">
        <NavSectionHeader section="automation" label={t('nav.automation')} badge={t('nav.comingSoon')} />
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

      {/* INTEGRATION */}
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

      {/* ADMINISTRATION */}
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
          <button onClick={() => { onSettingsTabChange?.('rental-rules'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'rental-rules')}>
            <ShieldCheck className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.rentalRules')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('billing'); handleViewChange('settings'); }} className={subNavBtnClass(currentView === 'settings' && settingsTab === 'billing')}>
            <CreditCard className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.billingSubscription')}</span>
          </button>
        </nav>
      )}

      {/* SUPPORT */}
      <div className="mt-5 mb-1.5">
        <button onClick={() => handleViewChange('support')} className={navBtnClass(currentView === 'support')}>
          <Headphones className="w-[14px] h-[14px] shrink-0" />
          <span className="flex-1 text-left">{t('nav.support')}</span>
          {supportUnreadCount > 0 && (
            <span className="sq-chip sq-chip-neutral !text-[8.5px] !px-1.5 !py-[1px] tabular-nums">{supportUnreadCount}</span>
          )}
        </button>
        <button onClick={() => handleViewChange('help-center')} className={navBtnClass(currentView === 'help-center')}>
          <HelpCircle className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.helpCenter')}</span>
        </button>
        {canDataAnalyse && (
          <button onClick={() => handleViewChange('data-analyse')} className={navBtnClass(currentView === 'data-analyse')}>
            <Activity className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.dataAnalyse')}</span>
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-border/60" />

      {/* Quick Actions */}
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
          <SynqLogo className="h-[25px] w-auto object-contain" />

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
            <SynqLogo className="h-[27px] w-auto object-contain" />
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
              <button onClick={() => handleViewChange('dashboard')} className={collapsedBtnClass(currentView === 'dashboard')}>
                <LayoutDashboard className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.dashboard')} />
              </button>
              <button onClick={() => handleViewChange('bookings')} className={collapsedBtnClass(currentView === 'bookings')}>
                <Calendar className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.bookings')} />
              </button>
              <button onClick={() => handleViewChange('customers')} className={collapsedBtnClass(currentView === 'customers' || currentView === 'customer-detail')}>
                <Users className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.customers')} />
              </button>
              <button onClick={() => handleViewChange('stations')} className={collapsedBtnClass(currentView === 'stations' || currentView === 'station-detail')}>
                <MapPin className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.stations')} />
              </button>
              <button onClick={() => handleViewChange('tasks')} className={collapsedBtnClass(currentView === 'tasks')}>
                <ListTodo className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.tasks')} />
              </button>
              <button onClick={handleFleetNav} className={collapsedBtnClass(isFleetActive)}>
                <Car className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.fleet')} />
              </button>

              <div className="w-4 h-px my-1.5 bg-border" />

              <button onClick={() => handleViewChange('financial-insights')} className={collapsedBtnClass(currentView === 'financial-insights')}>
                <DollarSign className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.financialInsights')} />
              </button>
              <button onClick={() => handleViewChange('invoices')} className={collapsedBtnClass(currentView === 'invoices')}>
                <FileText className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.invoices')} />
              </button>
              <button onClick={() => handleViewChange('price-tariffs')} className={collapsedBtnClass(currentView === 'price-tariffs')}>
                <Tag className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.pricingTariffs')} />
              </button>

              <div className="w-4 h-px my-1.5 bg-border" />

              <button onClick={() => { onSettingsTabChange?.(settingsTab ?? 'account'); handleViewChange('settings'); }} className={collapsedBtnClass(currentView === 'settings')}>
                <Settings className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.administration')} />
              </button>

              <button onClick={() => handleViewChange('support')} className={collapsedBtnClass(currentView === 'support')}>
                <span className="relative">
                  <Headphones className="w-[14px] h-[14px]" />
                  {supportUnreadCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 min-w-[14px] rounded-full bg-[color:var(--brand)] px-0.5 text-center text-[8px] font-bold leading-[14px] text-white">
                      {supportUnreadCount > 9 ? '9+' : supportUnreadCount}
                    </span>
                  )}
                </span>
                <CollapsedTooltip label={t('nav.support')} />
              </button>
            </nav>

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
              <button
                onClick={() => handleViewChange('document-upload')}
                className="sq-3d-btn sq-3d-btn--neutral w-8 h-8 rounded-lg flex items-center justify-center relative group"
                aria-label={t('nav.upload')}
              >
                <Upload className="w-3.5 h-3.5" />
                <CollapsedTooltip label={t('nav.upload')} />
              </button>
              <button
                onClick={() => handleViewChange('ai-assistant')}
                className="sq-3d-btn sq-3d-btn--ai w-8 h-8 rounded-lg flex items-center justify-center relative group"
                aria-label={t('nav.aiAssistant')}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <CollapsedTooltip label={t('nav.aiAssistant')} />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded: full navigation */
          <div className="flex-1 overflow-y-auto px-[18px] py-4 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'color-mix(in srgb, var(--border) 50%, transparent) transparent',
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