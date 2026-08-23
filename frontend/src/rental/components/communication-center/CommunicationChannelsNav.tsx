import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationChannelsSection } from './communication-center.types';
import {
  canAccessCommunicationChannelsSection,
} from './communication-channels-permissions';
import type { HasPermissionFn } from './communication-settings-permissions';

interface CommunicationChannelsNavProps {
  activeSection: CommunicationChannelsSection;
  hasPermission: HasPermissionFn;
  membershipRole?: string | null;
  onChange: (section: CommunicationChannelsSection) => void;
}

const sections: CommunicationChannelsSection[] = [
  'overview',
  'whatsapp',
  'voice',
  'sms',
  'email',
];

const sectionLabelKey = {
  overview: 'communication.channels.nav.overview',
  whatsapp: 'communication.channels.whatsapp',
  voice: 'communication.channels.voice',
  sms: 'communication.channels.sms',
  email: 'communication.channels.email',
} as const;

export function CommunicationChannelsNav({
  activeSection,
  hasPermission,
  membershipRole,
  onChange,
}: CommunicationChannelsNavProps) {
  const { t } = useLanguage();
  const visibleSections = sections.filter((section) =>
    canAccessCommunicationChannelsSection(section, hasPermission, membershipRole),
  );

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border/40 pb-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3"
      aria-label={t('communication.channels.navLabel')}
      data-testid="communication-channels-nav"
    >
      {visibleSections.map((section) => (
        <button
          key={section}
          type="button"
          data-testid={`communication-channels-nav-${section}`}
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
