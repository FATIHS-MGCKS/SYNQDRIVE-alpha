import type { ReactNode } from 'react';
import { VoiceResponsiveTabs, VoiceSectionHeader, VoiceProviderDiagnostic } from '../../../components/voice-ui';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  VOICE_SETTINGS_SECTIONS,
  type VoiceSettingsSection,
} from './voice-information-architecture';

const SETTINGS_LABEL_KEYS: Record<VoiceSettingsSection, string> = {
  assistant: 'voice.settings.section.assistant',
  knowledge: 'voice.settings.section.knowledge',
  permissions: 'voice.settings.section.permissions',
  telephony: 'voice.settings.section.telephony',
  availability: 'voice.settings.section.availability',
  privacy: 'voice.settings.section.privacy',
  budget: 'voice.settings.section.budget',
  diagnostics: 'voice.settings.section.diagnostics',
};

export interface VoiceSettingsPanelProps {
  activeSection: VoiceSettingsSection;
  onSectionChange: (section: VoiceSettingsSection) => void;
  children: ReactNode;
  diagnosticRows?: Array<{
    id: string;
    label: string;
    value?: ReactNode;
    status: 'ok' | 'warn' | 'error' | 'unknown' | 'loading';
    hint?: string;
  }>;
  diagnosticsTitle?: string;
}

export function VoiceSettingsPanel({
  activeSection,
  onSectionChange,
  children,
  diagnosticRows,
  diagnosticsTitle,
}: VoiceSettingsPanelProps) {
  const { t } = useLanguage();

  const tabs = VOICE_SETTINGS_SECTIONS.map((section) => ({
    key: section,
    label: t(SETTINGS_LABEL_KEYS[section] as 'voice.settings.section.assistant'),
    disabled: false,
  }));

  return (
    <div className="space-y-4">
      <VoiceResponsiveTabs
        items={tabs}
        activeKey={activeSection}
        onChange={(key) => onSectionChange(key as VoiceSettingsSection)}
        ariaLabel={t('voice.settings.navLabel')}
        variant="tabs"
      />

      {activeSection === 'diagnostics' && diagnosticRows ? (
        <VoiceProviderDiagnostic
          title={diagnosticsTitle ?? t('voice.settings.diagnosticsTitle')}
          rows={diagnosticRows}
        />
      ) : (
        <div key={activeSection} className="animate-fade-up motion-reduce:animate-none">
          <VoiceSectionHeader title={t(SETTINGS_LABEL_KEYS[activeSection] as 'voice.settings.section.assistant')} />
          {children}
        </div>
      )}
    </div>
  );
}
