import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationSettingsSection } from './communication-center.types';
import {
  canAccessCommunicationSettingsSection,
  type HasPermissionFn,
} from './communication-settings-permissions';

interface CommunicationSettingsNavProps {
  activeSection: CommunicationSettingsSection;
  hasPermission: HasPermissionFn;
  membershipRole?: string | null;
  onChange: (section: CommunicationSettingsSection) => void;
}

const sections: CommunicationSettingsSection[] = ['overview', 'whatsapp', 'voice', 'sms'];

const sectionLabelKey = {
  overview: 'communication.settings.overview.nav',
  whatsapp: 'communication.settings.whatsapp.title',
  voice: 'communication.settings.voice.title',
  sms: 'communication.settings.sms.title',
} as const;

export function CommunicationSettingsNav({
  activeSection,
  hasPermission,
  membershipRole,
  onChange,
}: CommunicationSettingsNavProps) {
  const { t } = useLanguage();
  const visibleSections = sections.filter((section) =>
    canAccessCommunicationSettingsSection(section, hasPermission, membershipRole),
  );

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border/40 pb-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3"
      aria-label={t('communication.settings.navLabel')}
      data-testid="communication-settings-nav"
    >
      {visibleSections.map((section) => (
        <button
          key={section}
          type="button"
          data-testid={`communication-settings-nav-${section}`}
          className={cn(
            'sq-press shrink-0 rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors',
            activeSection === section
              ? 'bg-[color:var(--brand)]/10 text-foreground'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}
          onClick={() => onChange(section)}
        >
          {t(sectionLabelKey[section])}
        </button>
      ))}
    </nav>
  );
}
