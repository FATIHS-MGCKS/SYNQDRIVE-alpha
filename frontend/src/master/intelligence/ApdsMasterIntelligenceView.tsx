import { MasterPageHeader, MasterPageSection } from '../shell';
import { MasterIntelligenceContextProvider } from './MasterIntelligenceContextProvider';
import { useMasterIntelligenceContext } from './useMasterIntelligenceContext';
import { IntelligenceCrossLink } from './IntelligenceCrossLink';
import { IntelligenceEmptyState } from './IntelligenceEmptyState';
import { EvidenceFreshnessHint, ShadowVsRealPollHint } from './EvidenceFreshnessHint';
import { useLanguage } from '../../i18n/LanguageContext';

function ApdsMasterIntelligenceContent() {
  const { t } = useLanguage();
  const { context } = useMasterIntelligenceContext();

  return (
    <>
      <MasterPageHeader
        title={t('master.intelligence.apds.title' as never)}
        description={t('master.intelligence.apds.description' as never)}
      />

      <MasterPageSection title={t('master.intelligence.section.context' as never)}>
        <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['orgId', context.orgId],
              ['vehicleId', context.vehicleId],
              ['apdOpportunityId', context.apdOpportunityId],
              ['policyVersion', context.policyVersion],
              ['apdEpochId', context.apdEpochId],
              ['asOf', context.asOf],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="rounded border border-border/50 px-2 py-1.5">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="break-all font-mono text-[11px]">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </MasterPageSection>

      <MasterPageSection title={t('master.intelligence.section.crossLinks' as never)}>
        <div className="flex flex-wrap gap-2">
          <IntelligenceCrossLink target="vehicles" />
          <IntelligenceCrossLink target="device-inventory" />
          <IntelligenceCrossLink target="vsi-intelligence" />
        </div>
      </MasterPageSection>

      <MasterPageSection title={t('master.intelligence.section.evidenceSemantics' as never)}>
        <p className="mb-2 text-xs text-muted-foreground" role="note">
          {t('master.intelligence.vsi.previewNote' as never)}
        </p>
        <div data-intelligence-preview="presentation-only" data-testid="intelligence-evidence-preview">
          <EvidenceFreshnessHint kind="simulated_shadow" className="mb-3" />
          <EvidenceFreshnessHint kind="verified_real_execution" className="mb-3" />
          <ShadowVsRealPollHint />
        </div>
      </MasterPageSection>

      <IntelligenceEmptyState
        titleKey="master.intelligence.apds.empty.title"
        bodyKey="master.intelligence.apds.empty.body"
        className="mt-6"
      />
    </>
  );
}

export function ApdsMasterIntelligenceView() {
  return (
    <MasterIntelligenceContextProvider view="apds-intelligence">
      <ApdsMasterIntelligenceContent />
    </MasterIntelligenceContextProvider>
  );
}
