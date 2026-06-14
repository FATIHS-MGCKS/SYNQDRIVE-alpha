import {
  LayoutDashboard, Building2, Users, Car, Target,
  Activity, CreditCard, Headphones,
  Radio, Package, Shield,
  Settings, BarChart3, Globe,
  Code2, FileText, Phone,
  ChevronRight, Menu, X, Plus, UserPlus,
  MapPin, Gauge, BookOpen, ShieldCheck
} from 'lucide-react';
import { useState } from 'react';
import synqdriveLogoDark from '../../assets/synqdrive-logo-dark.png';
import synqdriveLogoLight from '../../assets/synqdrive-logo.png';

export type MasterView =
  | 'dashboard'
  | 'organizations'
  | 'users'
  | 'vehicles'
  | 'prospects'
  | 'subscriptions'
  | 'activity-log'
  | 'support'
  | 'settings'
  | 'fleet-connection'
  | 'parts-accessories'
  | 'insurances'
  | 'voice-assistant'
  | 'high-mobility'
  | 'hm-compatibility'
  | 'architektur'
  | 'changes'
  | 'health-tracking'
  | 'trip-detection-logic'
  | 'performance-logic'
  | 'vehicle-logbook';

interface SidebarProps {
  isDarkMode: boolean;
  currentView?: MasterView;
  onViewChange?: (view: MasterView) => void;
  settingsTab?: string;
  onSettingsTabChange?: (tab: string) => void;
}

export function Sidebar({ isDarkMode, currentView, onViewChange, settingsTab, onSettingsTabChange }: SidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);

  const logo = isDarkMode ? synqdriveLogoDark : synqdriveLogoLight;

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const go = (view: MasterView) => {
    onViewChange?.(view);
    setMobileOpen(false);
  };

  const goSettings = (tab: string) => {
    onSettingsTabChange?.(tab);
    onViewChange?.('settings');
    setMobileOpen(false);
  };

  const active = (view: MasterView) => currentView === view;
  const activeSettings = (tab: string) => currentView === 'settings' && settingsTab === tab;

  const itemCls = (on: boolean) =>
    `sq-nav-rail w-full flex items-center gap-3 px-2.5 py-1.5 rounded-md !text-xs transition-all duration-200 ${
      on
        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] active font-medium'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:translate-x-[1px]'
    }`;

  const icon = 'w-4 h-4 shrink-0';

  const sectionLabel = (text: string) => (
    <div className="sq-section-label px-3 mt-5 mb-2">{text}</div>
  );

  const collapsibleHeader = (key: string, label: string) => (
    <button
      onClick={() => toggle(key)}
      className="w-full flex items-center justify-between px-3 py-1.5 mt-4 mb-1 rounded-md group transition-colors duration-150 hover:bg-accent/40"
    >
      <span className="sq-section-label">{label}</span>
      <ChevronRight className={`w-3 h-3 transition-transform duration-200 text-muted-foreground/60 ${expanded[key] ? 'rotate-90' : ''}`} />
    </button>
  );

  const NavContent = () => (
    <>
      {/* ── OVERVIEW ── */}
      {sectionLabel('Overview')}
      <nav className="space-y-0.5 mb-1">
        <button onClick={() => go('dashboard')} className={itemCls(active('dashboard'))}>
          <LayoutDashboard className={icon} /><span>Dashboard</span>
        </button>
      </nav>

      {/* ── MANAGEMENT ── */}
      {sectionLabel('Management')}
      <nav className="space-y-0.5 mb-1">
        <button onClick={() => go('organizations')} className={itemCls(active('organizations'))}>
          <Building2 className={icon} /><span>Organizations</span>
        </button>
        <button onClick={() => go('users')} className={itemCls(active('users'))}>
          <Users className={icon} /><span>Users</span>
        </button>
        <button onClick={() => go('vehicles')} className={itemCls(active('vehicles'))}>
          <Car className={icon} /><span>Vehicles</span>
        </button>
        <button onClick={() => go('prospects')} className={itemCls(active('prospects'))}>
          <Target className={icon} /><span>Prospects</span>
        </button>
      </nav>

      {/* ── OPERATIONS (collapsible) ── */}
      {collapsibleHeader('operations', 'Operations')}
      {expanded.operations && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => go('activity-log')} className={itemCls(active('activity-log'))}>
            <Activity className={icon} /><span>Activity Log</span>
          </button>
          <button onClick={() => go('subscriptions')} className={itemCls(active('subscriptions'))}>
            <CreditCard className={icon} /><span>Subscriptions</span>
          </button>
          <button onClick={() => go('support')} className={itemCls(active('support'))}>
            <Headphones className={icon} /><span>Support Center</span>
          </button>
        </nav>
      )}

      {/* ── INTEGRATIONS (collapsible) ── */}
      {collapsibleHeader('integrations', 'Integrations')}
      {expanded.integrations && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => go('fleet-connection')} className={itemCls(active('fleet-connection'))}>
            <Radio className={icon} /><span>Fleet Connection</span>
          </button>
          <button onClick={() => go('parts-accessories')} className={itemCls(active('parts-accessories'))}>
            <Package className={icon} /><span>Parts & Accessories</span>
          </button>
          <button onClick={() => go('insurances')} className={itemCls(active('insurances'))}>
            <Shield className={icon} /><span>Insurances</span>
          </button>
          <button onClick={() => go('voice-assistant')} className={itemCls(active('voice-assistant'))}>
            <Phone className={icon} /><span>Voice Assistant</span>
          </button>
          <button onClick={() => go('high-mobility')} className={itemCls(active('high-mobility'))}>
            <Radio className={icon} /><span>High Mobility</span>
          </button>
          <button onClick={() => go('hm-compatibility')} className={itemCls(active('hm-compatibility'))}>
            <ShieldCheck className={icon} /><span>HM Compatibility Check</span>
          </button>
        </nav>
      )}

      {/* ── CONFIGURATION (collapsible) ── */}
      {collapsibleHeader('configuration', 'Configuration')}
      {expanded.configuration && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => goSettings('general')} className={itemCls(activeSettings('general'))}>
            <Settings className={icon} /><span>General</span>
          </button>
          <button onClick={() => goSettings('integrations')} className={itemCls(activeSettings('integrations'))}>
            <Globe className={icon} /><span>Integrations</span>
          </button>
          <button onClick={() => goSettings('monitoring')} className={itemCls(activeSettings('monitoring'))}>
            <BarChart3 className={icon} /><span>Monitoring</span>
          </button>
        </nav>
      )}

      {/* ── SYNQDRIVE CODE (collapsible) ── */}
      {collapsibleHeader('synqdrive-code', 'SynqDrive Code')}
      {expanded['synqdrive-code'] && (
        <nav className="space-y-0.5 mb-1">
          <button onClick={() => go('architektur')} className={itemCls(active('architektur'))}>
            <Code2 className={icon} /><span>Architektur</span>
          </button>
          <button onClick={() => go('changes')} className={itemCls(active('changes'))}>
            <FileText className={icon} /><span>Changes</span>
          </button>
          <button onClick={() => go('health-tracking')} className={itemCls(active('health-tracking'))}>
            <Activity className={icon} /><span>Health Tracking</span>
          </button>
          <button onClick={() => go('trip-detection-logic')} className={itemCls(active('trip-detection-logic'))}>
            <MapPin className={icon} /><span>Trip Detection Logic</span>
          </button>
          <button onClick={() => go('performance-logic')} className={itemCls(active('performance-logic'))}>
            <Gauge className={icon} /><span>Performance Logic</span>
          </button>
          <button onClick={() => go('vehicle-logbook')} className={itemCls(active('vehicle-logbook'))}>
            <BookOpen className={icon} /><span>Vehicle Logbook</span>
          </button>
        </nav>
      )}

      {/* ── DIVIDER ── */}
      <div className="my-5 h-px bg-border" />

      {/* ── QUICK ACTIONS ── */}
      <div className="pb-3">
        <div className="sq-section-label mb-2.5 px-1 text-center">
          Quick Actions
        </div>
        <div className="grid grid-cols-2 gap-1">
          <QuickAction
            label="New Org"
            Icon={Plus}
            variant="brand"
            onClick={() => go('organizations')}
          />
          <QuickAction
            label="Invite User"
            Icon={UserPlus}
            variant="success"
            onClick={() => go('users')}
          />
          <QuickAction
            label="Support"
            Icon={Headphones}
            variant="neutral"
            onClick={() => go('support')}
          />
          <QuickAction
            label="Activity"
            Icon={Activity}
            variant="neutral"
            onClick={() => go('activity-log')}
          />
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── MOBILE TOP BAR ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b bg-sidebar border-sidebar-border">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="p-2 rounded-md transition-colors hover:bg-accent text-muted-foreground"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img src={logo} alt="SynqDrive" className="h-4 w-auto object-contain" />
          <div className="w-9" />
        </div>

        <div className={`overflow-hidden transition-all duration-300 ${
          mobileOpen ? 'max-h-[calc(100vh-3.5rem)] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div
            className="px-3 pb-6 overflow-y-auto border-t border-sidebar-border"
            style={{ maxHeight: 'calc(100vh - 3.5rem)' }}
          >
            <NavContent />
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setMobileOpen(false)}
          style={{ top: '3.5rem' }}
        />
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      <div className="hidden lg:flex w-[220px] h-screen flex-col shrink-0 border-r bg-sidebar border-sidebar-border">
        {/* Logo */}
        <div className="px-4 py-3 flex flex-col items-center gap-1.5 border-b border-sidebar-border">
          <img src={logo} alt="SynqDrive" className="h-7 w-auto object-contain" />
          <span className="sq-chip sq-chip-critical !text-[10px] !font-bold uppercase tracking-[0.16em]">
            Master Admin
          </span>
        </div>

        {/* Scrollable nav */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ scrollbarWidth: 'thin', scrollbarColor: isDarkMode ? 'rgba(100,116,139,0.25) transparent' : 'rgba(156,163,175,0.3) transparent' }}
        >
          <NavContent />
        </div>
      </div>
    </>
  );
}

/* ── Quick Action Button ──
   Token-based tones (brand / success / neutral) — theme-aware in light +
   dark with no hardcoded indigo/emerald/gray. */

type QAVariant = 'brand' | 'success' | 'neutral';

function QuickAction({
  label, Icon, variant, onClick,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  variant: QAVariant;
  onClick: () => void;
}) {
  const base = 'flex h-[30px] items-center justify-center gap-1.5 px-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 active:scale-[0.97]';

  const colors: Record<QAVariant, string> = {
    brand: 'sq-tone-brand hover:opacity-90',
    success: 'sq-tone-success hover:opacity-90',
    neutral: 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
  };

  return (
    <button onClick={onClick} className={`${base} ${colors[variant]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}
