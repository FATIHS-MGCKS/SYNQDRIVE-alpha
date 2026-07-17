import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import {
  chromeSectionNavClass,
  chromeSectionNavItemClass,
} from '../../../components/patterns/chrome-tab-bar';
import { useLanguage } from '../../i18n/LanguageContext';
import type { VoiceOpsTab } from './voice-wizard.ops';

const OPS_TABS: { key: VoiceOpsTab; labelKey: string; icon: string }[] = [
  { key: 'overview', labelKey: 'voice.ops.tab.overview', icon: 'layout-dashboard' },
  { key: 'conversations', labelKey: 'voice.ops.tab.conversations', icon: 'file-text' },
  { key: 'automations', labelKey: 'voice.ops.tab.automations', icon: 'workflow' },
  { key: 'analytics', labelKey: 'voice.ops.tab.analytics', icon: 'bar-chart-3' },
  { key: 'settings', labelKey: 'voice.ops.tab.settings', icon: 'settings' },
];

interface VoiceOpsSectionNavProps {
  activeTab: VoiceOpsTab;
  onChange: (tab: VoiceOpsTab) => void;
}

export function VoiceOpsSectionNav({ activeTab, onChange }: VoiceOpsSectionNavProps) {
  const { t } = useLanguage();

  return (
    <nav className={chromeSectionNavClass()} aria-label={t('voice.ops.navLabel')}>
      <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {OPS_TABS.map(item => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={cn(chromeSectionNavItemClass(active, 'shrink-0 rounded-lg px-3 py-2'))}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon as 'settings'} className="h-3.5 w-3.5 shrink-0" />
              {t(item.labelKey as 'voice.ops.tab.overview')}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
