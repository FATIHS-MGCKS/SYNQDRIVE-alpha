import { LayoutDashboard, Briefcase, DollarSign, Calendar, Car, AlertTriangle, Users, CheckSquare, FileText, AlertCircle, Tag, BarChart3, Settings, Building2, Wifi, MapPin, UserCog, CreditCard, Plus, Upload, ChevronDown, Bell, MessageSquare, LayoutGrid, ListTodo, Menu, X, Shield, Package, Lock, HelpCircle, Zap, Phone, Wrench, Truck, Activity, Headphones, ChevronRight, User, PanelLeftClose, PanelLeftOpen, Gauge } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
// auth import removed — logout moved to TopBar account menu
import synqdriveLogoLight from '../../assets/synqdrive-logo-light.png';
import synqdriveLogoDark from '../../assets/synqdrive-logo-dark.png';

type SettingsTab = 'account' | 'company' | 'fleet-connection' | 'users' | 'billing' | 'data-authorization';

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
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
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

  const toggleSection = (section: string) => {
    if (expandedSections.includes(section)) {
      setExpandedSections(expandedSections.filter(s => s !== section));
    } else {
      setExpandedSections([...expandedSections, section]);
    }
  };

  const navBtnClass = (isActive: boolean) =>
    `w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all duration-200 text-xs ${
      isActive
        ? 'bg-accent text-foreground font-medium'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    }`;

  const collapsedBtnClass = (isActive: boolean) =>
    `w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 relative group ${
      isActive
        ? 'bg-accent text-foreground font-medium'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    }`;

  // Tooltip for collapsed items
  const CollapsedTooltip = ({ label }: { label: string }) => (
    <div className={`absolute left-full ml-2 px-2 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
      isDarkMode ? 'bg-neutral-800 text-white shadow-lg border border-neutral-700' : 'bg-gray-900 text-white shadow-lg'
    }`}>
      {label}
    </div>
  );

  // Section header button
  const sectionHeaderClass = `w-full flex items-center justify-between px-2 py-1 cursor-pointer group`;

  // The navigation content (shared between desktop sidebar and mobile menu)
  const NavigationContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* OPERATIONS Section — always visible */}
      <div className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 px-2 ${isMobile ? 'mt-3' : 'mt-1'} text-muted-foreground`}>
        {t('nav.operations')}
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
      <div className="mt-3 mb-1">
        <button onClick={() => toggleSection('insights')} className={sectionHeaderClass}>
          <span className={`text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground`}>{t('nav.insights')}</span>
          <ChevronRight className={`w-3 h-3 transition-transform duration-200 text-muted-foreground ${expandedSections.includes('insights') ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expandedSections.includes('insights') && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => handleViewChange('rental-driving-analysis')} className={navBtnClass(currentView === 'rental-driving-analysis')}>
            <Gauge className="w-[14px] h-[14px] shrink-0" /><span>Rental Driving Analysis</span>
          </button>
          <button onClick={() => handleViewChange('analytics')} className={navBtnClass(currentView === 'analytics')}>
            <BarChart3 className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.analytics')}</span>
          </button>
          <button onClick={() => handleViewChange('fleet-condition')} className={navBtnClass(currentView === 'fleet-condition')}>
            <Activity className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fleetCondition')}</span>
          </button>
        </nav>
      )}

      {/* FINANCE Section */}
      <div className="mt-3 mb-1">
        <button onClick={() => toggleSection('finance')} className={sectionHeaderClass}>
          <span className={`text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground`}>{t('nav.finance')}</span>
          <ChevronRight className={`w-3 h-3 transition-transform duration-200 text-muted-foreground ${expandedSections.includes('finance') ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expandedSections.includes('finance') && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => handleViewChange('invoices')} className={navBtnClass(currentView === 'invoices')}>
            <FileText className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.invoices')}</span>
          </button>
          <button onClick={() => handleViewChange('fines')} className={navBtnClass(currentView === 'fines')}>
            <AlertCircle className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fines')}</span>
          </button>
          <button onClick={() => handleViewChange('price-tariffs')} className={navBtnClass(currentView === 'price-tariffs')}>
            <Tag className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.pricingTariffs')}</span>
          </button>
        </nav>
      )}

      {/* TASKS Section */}
      <div className="mt-3 mb-1">
        <button onClick={() => toggleSection('tasks')} className={sectionHeaderClass}>
          <span className={`text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground`}>{t('nav.tasks')}</span>
          <ChevronRight className={`w-3 h-3 transition-transform duration-200 text-muted-foreground ${expandedSections.includes('tasks') ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expandedSections.includes('tasks') && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => handleViewChange('tasks')} className={navBtnClass(currentView === 'tasks')}>
            <ListTodo className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.taskManagement')}</span>
          </button>
          <button onClick={() => handleViewChange('vendor-management')} className={navBtnClass(currentView === 'vendor-management')}>
            <Briefcase className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.vendorManagement')}</span>
          </button>
        </nav>
      )}

      {/* AUTOMATION Section */}
      <div className="mt-3 mb-1">
        <button onClick={() => toggleSection('automation')} className={sectionHeaderClass}>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground`}>{t('nav.automation')}</span>
          </div>
          <ChevronRight className={`w-3 h-3 transition-transform duration-200 text-muted-foreground ${expandedSections.includes('automation') ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expandedSections.includes('automation') && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => handleViewChange('workflow-automation')} className={navBtnClass(currentView === 'workflow-automation')}>
            <Zap className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.workflowAutomation')}</span>
          </button>
          <button onClick={() => handleViewChange('ai-voice-assistant')} className={navBtnClass(currentView === 'ai-voice-assistant')}>
            <MessageSquare className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.aiVoiceAssistant')}</span>
          </button>
          <button onClick={() => handleViewChange('whatsapp-business')} className={navBtnClass(currentView === 'whatsapp-business')}>
            <Phone className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.whatsappBusiness')}</span>
          </button>
        </nav>
      )}

      {/* INTEGRATIONS Section */}
      <div className="mt-3 mb-1">
        <button onClick={() => toggleSection('integrations')} className={sectionHeaderClass}>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground`}>{t('nav.integrations')}</span>
            <span className={`text-[8px] px-1 py-0.5 rounded-full font-medium ${isDarkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-500'}`}>{t('nav.comingSoon')}</span>
          </div>
          <ChevronRight className={`w-3 h-3 transition-transform duration-200 text-muted-foreground ${expandedSections.includes('integrations') ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expandedSections.includes('integrations') && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => handleViewChange('insurances')} className={navBtnClass(currentView === 'insurances')}>
            <Shield className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.insurance')}</span>
          </button>
          <button onClick={() => handleViewChange('parts-accessories')} className={navBtnClass(currentView === 'parts-accessories')}>
            <Package className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.partsAccessories')}</span>
          </button>
          <button onClick={() => handleViewChange('service-maintenance')} className={navBtnClass(currentView === 'service-maintenance')}>
            <Wrench className="w-[14px] h-[14px] shrink-0" /><span>Service & Maintenance</span>
          </button>
          <button className={`${navBtnClass(false)} opacity-50 cursor-not-allowed`} disabled>
            <CreditCard className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fuelCards')}</span>
            <span className={`ml-auto text-[8px] px-1 py-0.5 rounded-full font-medium ${isDarkMode ? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>{t('nav.soon')}</span>
          </button>
          <button className={`${navBtnClass(false)} opacity-50 cursor-not-allowed`} disabled>
            <Truck className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.vehicleBrokerage')}</span>
            <span className={`ml-auto text-[8px] px-1 py-0.5 rounded-full font-medium ${isDarkMode ? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>{t('nav.soon')}</span>
          </button>
        </nav>
      )}

      {/* ADMINISTRATION Section */}
      <div className="mt-3 mb-1">
        <button onClick={() => toggleSection('administration')} className={sectionHeaderClass}>
          <span className={`text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground`}>{t('nav.administration')}</span>
          <ChevronRight className={`w-3 h-3 transition-transform duration-200 text-muted-foreground ${expandedSections.includes('administration') ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expandedSections.includes('administration') && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => { onSettingsTabChange?.('account'); handleViewChange('settings'); }} className={navBtnClass(currentView === 'settings' && settingsTab === 'account')}>
            <User className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.accountInfo')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('company'); handleViewChange('settings'); }} className={navBtnClass(currentView === 'settings' && settingsTab === 'company')}>
            <Building2 className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.companyInfo')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('users'); handleViewChange('settings'); }} className={navBtnClass(currentView === 'settings' && settingsTab === 'users')}>
            <UserCog className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.usersRoles')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('fleet-connection'); handleViewChange('settings'); }} className={navBtnClass(currentView === 'settings' && settingsTab === 'fleet-connection')}>
            <Wifi className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.fleetConnectivity')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('data-authorization'); handleViewChange('settings'); }} className={navBtnClass(currentView === 'settings' && settingsTab === 'data-authorization')}>
            <Lock className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.dataAuthorization')}</span>
          </button>
          <button onClick={() => { onSettingsTabChange?.('billing'); handleViewChange('settings'); }} className={navBtnClass(currentView === 'settings' && settingsTab === 'billing')}>
            <CreditCard className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.billingSubscription')}</span>
          </button>
        </nav>
      )}

      {/* SUPPORT */}
      <div className="mt-3 mb-1">
        <button onClick={() => handleViewChange('support')} className={navBtnClass(currentView === 'support')}>
          <Headphones className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.support')}</span>
        </button>
        <button onClick={() => handleViewChange('help-center')} className={navBtnClass(currentView === 'help-center')}>
          <HelpCircle className="w-[14px] h-[14px] shrink-0" /><span>{t('nav.helpCenter')}</span>
        </button>
      </div>

      {/* Divider */}
      <div className={`my-3 h-px bg-border`}></div>

      {/* Quick Actions */}
      <div className="pb-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-1 text-center text-muted-foreground">
          {t('nav.quickActions')}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {/* New Booking */}
          <button 
            onClick={() => { onNewBookingClick?.(); setMobileMenuOpen(false); }}
            className={`group relative flex items-center gap-1.5 px-2 py-2 rounded-lg transition-all duration-300 overflow-hidden ${
              isDarkMode
                ? 'bg-gradient-to-b from-indigo-500 via-indigo-600 to-indigo-700 hover:from-indigo-400 hover:via-indigo-500 hover:to-indigo-600 shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset,0_-1px_0_0_rgba(0,0,0,0.25)_inset,0_4px_16px_rgba(99,102,241,0.25)] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.2)_inset,0_-1px_0_0_rgba(0,0,0,0.3)_inset,0_8px_28px_rgba(99,102,241,0.4)]'
                : 'bg-gradient-to-b from-indigo-400 via-indigo-500 to-indigo-600 hover:from-indigo-350 hover:via-indigo-450 hover:to-indigo-550 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_-1px_0_0_rgba(0,0,0,0.15)_inset,0_4px_16px_rgba(99,102,241,0.3)] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset,0_-1px_0_0_rgba(0,0,0,0.2)_inset,0_8px_28px_rgba(99,102,241,0.45)]'
            } text-white hover:scale-[1.03] active:scale-[0.97] active:shadow-[0_1px_0_0_rgba(255,255,255,0.1)_inset,0_-1px_0_0_rgba(0,0,0,0.2)_inset,0_2px_6px_rgba(99,102,241,0.2)]`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/5 to-transparent pointer-events-none rounded-lg" />
            <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/15 to-transparent pointer-events-none rounded-b-lg" />
            <div className="absolute inset-x-2 top-[1px] h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
            <div className="relative w-6 h-6 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.15),0_1px_0_0_rgba(255,255,255,0.1)_inset]">
              <Plus className="w-3 h-3 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" />
            </div>
            <span className="relative text-[9px] font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] truncate">{t('nav.newBooking')}</span>
          </button>

          {/* New Task */}
          <button 
            onClick={() => { onNewTaskClick?.(); setMobileMenuOpen(false); }}
            className={`group relative flex items-center gap-1.5 px-2 py-2 rounded-lg transition-all duration-300 overflow-hidden ${
              isDarkMode
                ? 'bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 hover:from-emerald-400 hover:via-emerald-500 hover:to-emerald-600 shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset,0_-1px_0_0_rgba(0,0,0,0.25)_inset,0_4px_16px_rgba(16,185,129,0.25)] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.2)_inset,0_-1px_0_0_rgba(0,0,0,0.3)_inset,0_8px_28px_rgba(16,185,129,0.4)]'
                : 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 hover:from-emerald-350 hover:via-emerald-450 hover:to-emerald-550 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_-1px_0_0_rgba(0,0,0,0.15)_inset,0_4px_16px_rgba(16,185,129,0.3)] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.3)_inset,0_-1px_0_0_rgba(0,0,0,0.2)_inset,0_8px_28px_rgba(16,185,129,0.45)]'
            } text-white hover:scale-[1.03] active:scale-[0.97] active:shadow-[0_1px_0_0_rgba(255,255,255,0.1)_inset,0_-1px_0_0_rgba(0,0,0,0.2)_inset,0_2px_6px_rgba(16,185,129,0.2)]`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/5 to-transparent pointer-events-none rounded-lg" />
            <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/15 to-transparent pointer-events-none rounded-b-lg" />
            <div className="absolute inset-x-2 top-[1px] h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
            <div className="relative w-6 h-6 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.15),0_1px_0_0_rgba(255,255,255,0.1)_inset]">
              <CheckSquare className="w-3 h-3 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" />
            </div>
            <span className="relative text-[9px] font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] truncate">{t('nav.newTask')}</span>
          </button>

          {/* Upload Document */}
          <button onClick={() => { handleViewChange('document-upload'); }} className={`group relative flex items-center gap-1.5 px-2 py-2 rounded-lg transition-all duration-300 overflow-hidden hover:scale-[1.03] active:scale-[0.97] ${
            currentView === 'document-upload'
              ? isDarkMode
                ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400 shadow-[0_1px_0_0_rgba(59,130,246,0.15)_inset]'
                : 'bg-indigo-50 border border-indigo-200/70 text-indigo-700 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset]'
              : isDarkMode
                ? 'bg-gradient-to-b from-white/[0.08] via-white/[0.04] to-white/[0.02] border border-white/[0.08] hover:from-white/[0.12] hover:via-white/[0.07] hover:to-white/[0.04] hover:border-white/[0.12] text-gray-300 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_-1px_0_0_rgba(0,0,0,0.3)_inset,0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_-1px_0_0_rgba(0,0,0,0.35)_inset,0_8px_28px_rgba(0,0,0,0.35)]'
                : 'bg-gradient-to-b from-white/95 via-white/80 to-gray-100/80 border border-gray-200/70 hover:from-white hover:via-white/90 hover:to-gray-50/90 hover:border-gray-300/70 text-gray-600 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_-1px_0_0_rgba(0,0,0,0.04)_inset,0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.95)_inset,0_-1px_0_0_rgba(0,0,0,0.06)_inset,0_8px_28px_rgba(0,0,0,0.1)]'
          }`}>
            <div className={`absolute inset-x-2 top-[1px] h-[1px] bg-gradient-to-r from-transparent to-transparent pointer-events-none ${isDarkMode ? 'via-white/10' : 'via-white/80'}`} />
            <div className={`relative w-6 h-6 rounded-lg flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_0_0_rgba(255,255,255,0.5)_inset] ${
              isDarkMode ? 'bg-white/[0.08]' : 'bg-gradient-to-b from-gray-50 to-gray-100/80 border border-gray-200/50'
            }`}>
              <Upload className="w-3 h-3" />
            </div>
            <span className={`relative text-[9px] font-semibold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{t('nav.upload')}</span>
          </button>

          {/* AI Fleet Assistant */}
          <button onClick={() => { handleViewChange('ai-assistant'); }} className={`group relative flex items-center gap-1.5 px-2 py-2 rounded-lg transition-all duration-300 overflow-hidden hover:scale-[1.03] active:scale-[0.97] ${
            currentView === 'ai-assistant'
              ? isDarkMode
                ? 'bg-purple-500/25 border border-purple-500/40 text-purple-400 shadow-[0_1px_0_0_rgba(168,85,247,0.2)_inset]'
                : 'bg-purple-100 border border-purple-200/70 text-purple-700 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset]'
              : isDarkMode
                ? 'bg-gradient-to-b from-purple-500/15 via-violet-500/10 to-purple-600/8 border border-purple-500/15 hover:from-purple-500/25 hover:via-violet-500/18 hover:to-purple-600/12 hover:border-purple-400/25 shadow-[0_1px_0_0_rgba(168,85,247,0.1)_inset,0_-1px_0_0_rgba(0,0,0,0.25)_inset,0_4px_16px_rgba(147,51,234,0.1)] hover:shadow-[0_1px_0_0_rgba(168,85,247,0.15)_inset,0_-1px_0_0_rgba(0,0,0,0.3)_inset,0_8px_28px_rgba(147,51,234,0.25)]'
                : 'bg-gradient-to-b from-purple-50/90 via-violet-50/70 to-purple-100/60 border border-purple-200/50 hover:from-purple-100/95 hover:via-violet-50/80 hover:to-purple-100/80 hover:border-purple-300/60 shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset,0_-1px_0_0_rgba(147,51,234,0.06)_inset,0_4px_16px_rgba(147,51,234,0.08)] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_-1px_0_0_rgba(147,51,234,0.08)_inset,0_8px_28px_rgba(147,51,234,0.18)]'
          }`}>
            <div className={`absolute inset-x-2 top-[1px] h-[1px] bg-gradient-to-r from-transparent to-transparent pointer-events-none ${isDarkMode ? 'via-purple-400/15' : 'via-white/70'}`} />
            <div className={`relative w-6 h-6 rounded-lg flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(147,51,234,0.1),0_1px_0_0_rgba(255,255,255,0.15)_inset] ${
              isDarkMode ? 'bg-purple-500/20' : 'bg-gradient-to-b from-purple-50 to-purple-100/80 border border-purple-200/40'
            }`}>
              <MessageSquare className={`w-3 h-3 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
            </div>
            <span className={`relative text-[9px] font-semibold truncate ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>{t('nav.aiAssistant')}</span>
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
            className="h-4 w-auto object-contain"
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
            <NavigationContent isMobile />
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
        isCollapsed ? 'w-[52px]' : 'w-[220px]'
      }`}>
        {/* Logo/Brand Section */}
        <div className={`flex items-center border-b border-sidebar-border transition-all duration-300 ${
          isCollapsed ? 'px-2 py-4 justify-center' : 'px-4 py-5'
        }`}>
          {isCollapsed ? (
            <button onClick={onToggleCollapse} className="p-1 rounded-md transition-colors hover:bg-accent">
              <PanelLeftOpen className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          ) : (
            <div className="flex items-center w-full">
              <div className="flex-1 flex justify-center">
                <img src={synqdriveLogo} alt="SYNQDRIVE" className="h-6 w-auto object-contain" />
              </div>
              <button onClick={onToggleCollapse} className="p-1 rounded-md transition-colors shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent">
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

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
              <button onClick={() => handleViewChange('analytics')} className={collapsedBtnClass(currentView === 'analytics')}>
                <BarChart3 className="w-[14px] h-[14px]" />
                <CollapsedTooltip label={t('nav.analytics')} />
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

            {/* Collapsed Quick Actions */}
            <div className="mt-auto pt-2 w-full flex flex-col items-center gap-1 border-t border-sidebar-border">
              <button
                onClick={() => onNewBookingClick?.()}
                className="w-8 h-8 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white flex items-center justify-center transition-all relative group"
              >
                <Plus className="w-3 h-3" />
                <CollapsedTooltip label={t('nav.newBooking')} />
              </button>
              <button
                onClick={() => onNewTaskClick?.()}
                className="w-8 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all relative group"
              >
                <CheckSquare className="w-3 h-3" />
                <CollapsedTooltip label={t('nav.newTask')} />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded: full navigation */
          <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-gray-300/50 scrollbar-track-transparent"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: isDarkMode ? 'rgba(100,100,100,0.3) transparent' : 'rgba(209, 213, 219, 0.5) transparent'
            }}
          >
            <div className="max-w-[220px] mx-auto">
              <NavigationContent />
            </div>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-2" />
      </div>
    </>
  );
}