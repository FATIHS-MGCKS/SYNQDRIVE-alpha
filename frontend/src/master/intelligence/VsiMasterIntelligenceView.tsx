import { MasterPageHeader, MasterPageSection } from '../shell';
import { MasterIntelligenceContextProvider } from './MasterIntelligenceContextProvider';
import { useMasterIntelligenceContext } from './useMasterIntelligenceContext';
import { IntelligenceCrossLink } from './IntelligenceCrossLink';
import { IntelligenceEmptyState } from './IntelligenceEmptyState';
import {
  EvaluationBlockedBanner,
  EvidenceFreshnessHint,
  ShadowVsRealPollHint,
} from './EvidenceFreshnessHint';
import {
  ObservedDensityBadge,
  ProfileConfidenceIndicator,
  SignalProfileBadge,
} from './SignalProfileBadge';
import { useLanguage } from '../../i18n/LanguageContext';

function VsiMasterIntelligenceContent() {
  const { t } = useLanguage();
  const { context } = useMasterIntelligenceContext();

  return (
    <>
      <MasterPageHeader
        title={t('master.intelligence.vsi.title' as never)}
        description={t('master.intelligence.vsi.description' as never)}
      />

      {context.rejectedParams.length > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {t('master.intelligence.url.invalidParams' as never, {
            params: context.rejectedParams.join(', '),
          })}
        </p>
      ) : null}

      <MasterPageSection title={t('master.intelligence.section.context' as never)}>
        <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['orgId', context.orgId],
              ['vehicleId', context.vehicleId],
              ['providerSourceLinkId', context.providerSourceLinkId],
              ['physicalDeviceId', context.physicalDeviceId],
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
          <IntelligenceCrossLink target="apds-intelligence" />
        </div>
      </MasterPageSection>

      <MasterPageSection title={t('master.intelligence.section.previewComponents' as never)}>
        <p className="mb-3 text-xs text-muted-foreground" role="note">
          {t('master.intelligence.vsi.previewNote' as never)}
        </p>
        <div
          className="flex flex-wrap gap-2"
          data-intelligence-preview="presentation-only"
          data-testid="intelligence-badge-preview"
          aria-hidden
        >
          <SignalProfileBadge kind="lv" profile="LV_8H_OBSERVED" />
          <SignalProfileBadge kind="lv" profile="UNKNOWN" limitationCode="OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION" />
          <SignalProfileBadge kind="rpm" profile="RPM_1HZ" applicability="APPLICABLE" />
          <SignalProfileBadge kind="rpm" profile="UNKNOWN" applicability="NOT_APPLICABLE" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ProfileConfidenceIndicator level="HIGH" />
          <ObservedDensityBadge density="SUB_ONE_HZ" />
          <ObservedDensityBadge density="NOT_APPLICABLE" />
        </div>
        <EvaluationBlockedBanner limitationCode="OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION" className="mt-4" />
        <EvidenceFreshnessHint kind="not_available" className="mt-4" />
        <ShadowVsRealPollHint className="mt-3" />
      </MasterPageSection>

      <IntelligenceEmptyState
        titleKey="master.intelligence.vsi.empty.title"
        bodyKey="master.intelligence.vsi.empty.body"
        className="mt-6"
      />
    </>
  );
}

export function VsiMasterIntelligenceView() {
  return (
    <MasterIntelligenceContextProvider view="vsi-intelligence">
      <VsiMasterIntelligenceContent />
    </MasterIntelligenceContextProvider>
  );
}
