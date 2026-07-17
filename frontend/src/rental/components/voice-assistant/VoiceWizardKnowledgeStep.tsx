import { DataCard } from '../../../components/patterns/data-card';
import { StatusChip } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { VoiceAssistantData } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { KnowledgeIntegrationHints } from './KnowledgeIntegrationHints';
import { useVoiceKnowledgeLinks } from './useVoiceKnowledgeLinks';

interface VoiceWizardKnowledgeStepProps {
  orgId: string;
  assistant: VoiceAssistantData;
}

export function VoiceWizardKnowledgeStep({ orgId, assistant }: VoiceWizardKnowledgeStepProps) {
  const { t } = useLanguage();
  const { links } = useVoiceKnowledgeLinks(orgId, assistant);

  const items = [
    { key: 'organization', label: t('voice.knowledge.organization'), link: links.rentalRules },
    { key: 'stations', label: t('voice.knowledge.stations'), link: links.stations },
    { key: 'hours', label: t('voice.knowledge.hours'), link: links.openingHours },
    { key: 'rules', label: t('voice.knowledge.rentalRules'), link: links.rentalRules },
    { key: 'requirements', label: t('voice.knowledge.requirements'), link: links.bookingPrerequisites },
    { key: 'tariffs', label: t('voice.knowledge.tariffs'), link: links.priceTariffs },
    { key: 'categories', label: t('voice.knowledge.categories'), link: links.vehicleCategories },
  ];

  const connectedCount = items.filter(i => i.link.connected).length;
  const freshness =
    connectedCount >= 5 ? 'good' : connectedCount >= 3 ? 'partial' : 'needs_attention';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold tracking-[-0.02em] text-foreground">{t('voice.knowledge.title')}</h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            {t('voice.knowledge.description')}
          </p>
        </div>
        <StatusChip
          tone={freshness === 'good' ? 'success' : freshness === 'partial' ? 'watch' : 'critical'}
          className="text-[9px]"
        >
          {t(`voice.knowledge.freshness.${freshness}` as 'voice.knowledge.freshness.good')}
        </StatusChip>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map(item => (
          <DataCard
            key={item.key}
            title={item.label}
            className="rounded-xl shadow-[var(--shadow-1)]"
          >
            {item.link.loading ? (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" />
                {t('voice.common.loading')}
              </div>
            ) : (
              <>
                <StatusChip tone={item.link.connected ? 'success' : 'watch'} className="mb-2 text-[9px]">
                  {item.link.connected ? t('voice.knowledge.published') : t('voice.knowledge.missing')}
                </StatusChip>
                <p className="text-[10px] text-muted-foreground">{item.link.detail}</p>
              </>
            )}
          </DataCard>
        ))}
      </div>

      <KnowledgeIntegrationHints
        title={t('voice.knowledge.title')}
        description={t('voice.knowledge.description')}
        items={Object.values(links)}
      />
    </div>
  );
}
