import { LayoutDashboard, Calendar, Car, Users, MapPin } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations/en';

export type MainNavTab = 'dashboard' | 'bookings' | 'fleet' | 'customers' | 'stations';

const tabs: { id: MainNavTab; labelKey: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', labelKey: 'mainNav.dashboard', icon: LayoutDashboard },
  { id: 'bookings', labelKey: 'mainNav.bookings', icon: Calendar },
  { id: 'fleet', labelKey: 'mainNav.fleet', icon: Car },
  { id: 'customers', labelKey: 'mainNav.customers', icon: Users },
  { id: 'stations', labelKey: 'mainNav.stations', icon: MapPin },
];

interface MainNavTabsProps {
  isDarkMode: boolean;
  activeTab: MainNavTab;
  onTabChange: (tab: MainNavTab) => void;
}

export function MainNavTabs({ isDarkMode: _isDarkMode, activeTab, onTabChange }: MainNavTabsProps) {
  const { t } = useLanguage();
  return (
    <div className="rounded-lg p-1 border border-border bg-muted flex gap-1 mb-4 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 sq-press ${
            activeTab === tab.id
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
          }`}
        >
          <tab.icon className="w-4 h-4" />
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  );
}
