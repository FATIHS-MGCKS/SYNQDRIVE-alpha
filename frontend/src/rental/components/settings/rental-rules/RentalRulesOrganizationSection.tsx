import { ClipboardCheck } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { EmptyState, SectionHeader } from '../../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { OrganizationRentalRulesDto, RentalRulesOverviewDto } from './rental-rules.types';
import { countConfiguredRuleFields, formatBool, summarizeRules } from './rental-rules.utils';
import { RentalRulePublishImpactPanel } from './RentalRulePublishImpactPanel';
import { RentalRulesSectionIntro, RuleValueTile } from '../../shared/rental-requirements-ui';

const DEFAULT_RULE_FIELD_KEYS: Record<string, string> = {
  'Minimum age': 'minimumAgeYears',
  'License holding period': 'minimumLicenseHoldingYears',
  'Deposit required': 'depositAmount',
  'Credit card required': 'creditCardRequired',
  'Foreign travel': 'foreignTravelPolicy',
  'Additional driver': 'additionalDriverPolicy',
  'Young driver': 'youngDriverPolicy',
  Insurance: 'insuranceRequirement',
};

interface RentalRulesOrganizationSectionProps {
  orgId: string;
  overview: RentalRulesOverviewDto | null;
  defaults: OrganizationRentalRulesDto | null;
  canWrite: boolean;
  canPublish: boolean;
  onEdit: () => void;
  onPublished: () => Promise<void>;
}

export function RentalRulesOrganizationSection({
  orgId,
  overview,
  defaults,
  canWrite,
  canPublish,
  onEdit,
  onPublished,
}: RentalRulesOrganizationSectionProps) {
  const { t } = useLanguage();
  const defaultSummary = defaults ? summarizeRules(defaults) : [];
  const configuredFields = countConfiguredRuleFields(defaults);

  return (
    <section className="space-y-4">
      <SectionHeader
        title={t('rentalRules.ui.sections.organization')}
        description={t('rentalRules.ui.organization.description')}
        actions={
          canWrite ? (
            <Button type="button" variant="neutral" size="sm" onClick={onEdit}>
              {t('rentalRules.ui.actions.editDefaults')}
            </Button>
          ) : undefined
        }
      />

      <div className="surface-premium rounded-2xl border border-border/70 p-3 sm:p-4">
        <RentalRulesSectionIntro
          title={t('rentalRules.ui.organization.defaultsTitle')}
          description={t('rentalRules.ui.organization.defaultsDescription')}
        />

        {!overview?.defaultsConfigured ? (
          <EmptyState
            compact
            icon={<ClipboardCheck className="h-5 w-5" />}
            title={t('rentalRules.ui.organization.emptyTitle')}
            description={t('rentalRules.ui.organization.emptyDescription')}
            action={
              canWrite ? (
                <Button type="button" variant="primary" size="sm" onClick={onEdit}>
                  {t('rentalRules.ui.organization.configure')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="mb-3 text-[12px] text-muted-foreground">
              {t('rentalRules.ui.organization.configuredFields', { count: configuredFields })}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-3">
              {defaultSummary.map((row) => (
                <RuleValueTile
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  fieldKey={DEFAULT_RULE_FIELD_KEYS[row.label]}
                  density="mini"
                  locale="en"
                />
              ))}
              <RuleValueTile
                label="Manual approval"
                value={formatBool(defaults?.manualApprovalRequired)}
                fieldKey="manualApprovalRequired"
                density="mini"
                locale="en"
                highlighted={Boolean(defaults?.manualApprovalRequired)}
              />
            </div>
          </>
        )}
      </div>

      {defaults?.hasUnpublishedDraft && defaults.draftRevision ? (
        <div className="surface-premium rounded-2xl border border-border/70 p-3 sm:p-4">
          <RentalRulePublishImpactPanel
            orgId={orgId}
            scope="defaults"
            draftRevision={defaults.draftRevision}
            expectedVersion={defaults.version ?? 1}
            canPublish={canPublish}
            onPublished={onPublished}
          />
        </div>
      ) : null}
    </section>
  );
}
