import { DetailDrawer } from '../../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { RentalRulePublishImpactPanel } from './RentalRulePublishImpactPanel';
import type { RentalRulesDraftScope } from './rental-rules-matrix.utils';

interface RentalRulesPublishDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  drafts: RentalRulesDraftScope[];
  canPublish: boolean;
  onPublished: () => Promise<void>;
}

export function RentalRulesPublishDrawer({
  open,
  onOpenChange,
  orgId,
  drafts,
  canPublish,
  onPublished,
}: RentalRulesPublishDrawerProps) {
  const { t } = useLanguage();

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t('rentalRules.ui.publishDrawer.title')}
      description={t('rentalRules.ui.publishDrawer.description')}
      eyebrow={t('rentalRules.ui.publishDrawer.eyebrow')}
    >
      {drafts.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('rentalRules.ui.publishDrawer.empty')}</p>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => (
            <section
              key={draft.id}
              className="rounded-xl border border-border/60 bg-background/40 p-3"
            >
              <h3 className="text-[13px] font-semibold text-foreground">{draft.label}</h3>
              <RentalRulePublishImpactPanel
                orgId={orgId}
                scope={draft.scope}
                scopeEntityId={draft.scope === 'category' ? draft.id : undefined}
                draftRevision={{
                  id: draft.revisionId,
                  lockVersion: draft.lockVersion,
                  rulesHash: '',
                  version: draft.expectedVersion + 1,
                }}
                expectedVersion={draft.expectedVersion}
                canPublish={canPublish}
                onPublished={onPublished}
              />
            </section>
          ))}
        </div>
      )}
    </DetailDrawer>
  );
}
