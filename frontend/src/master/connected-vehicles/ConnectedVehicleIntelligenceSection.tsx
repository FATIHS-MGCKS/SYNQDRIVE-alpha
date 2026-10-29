import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { isMasterAdmin } from '../../lib/auth';
import {
  EvaluationBlockedBanner,
  EvidenceFreshnessHint,
  ShadowVsRealPollHint,
} from '../intelligence/EvidenceFreshnessHint';
import {
  SignalProfileBadge,
} from '../intelligence/SignalProfileBadge';
import {
  emptyIntelligenceContext,
  mergeMasterIntelligenceContext,
  navigateMasterIntelligenceCrossLink,
} from '../intelligence/master-intelligence-url';
import {
  evidenceKindFromSummary,
  mapSummaryToLvBadge,
  mapSummaryToRpmBadge,
} from '../intelligence/vsi-master-intelligence-ui.utils';
import { useVehicleDetailMasterIntelligence } from './useVehicleDetailMasterIntelligence';

type Props = {
  organizationId: string;
  vehicleId: string;
};

export function ConnectedVehicleIntelligenceSection({ organizationId, vehicleId }: Props) {
  const { t } = useLanguage();
  const enabled = isMasterAdmin();
  const { primaryProfile, primaryLink, apdsOverview, physicalDevice, loading, error, refresh } =
    useVehicleDetailMasterIntelligence({
      enabled,
      organizationId,
      vehicleId,
    });

  if (!enabled) return null;

  const baseContext = mergeMasterIntelligenceContext(emptyIntelligenceContext(), {
    orgId: organizationId,
    vehicleId,
    providerSourceLinkId: primaryLink.linkId,
    physicalDeviceId: physicalDevice?.id ?? null,
    rejectedParams: [],
  });

  const openVsi = () => navigateMasterIntelligenceCrossLink('vsi-intelligence', baseContext);
  const openApds = () => navigateMasterIntelligenceCrossLink('apds-intelligence', baseContext);
  const openPdi = () => navigateMasterIntelligenceCrossLink('device-inventory', baseContext);

  const lv = primaryProfile ? mapSummaryToLvBadge(primaryProfile) : null;
  const rpm = primaryProfile ? mapSummaryToRpmBadge(primaryProfile) : null;
  const pdiNotApplicable =
    !physicalDevice &&
    primaryProfile?.rpmApplicability === 'NOT_APPLICABLE';

  return (
    <section className="space-y-3" aria-labelledby="cv-intelligence-heading">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="cv-intelligence-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t('master.intelligence.vehicleDetail.sectionTitle' as never)}
        </h3>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => void refresh()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{t('master.intelligence.vsi.retry' as never)}</span>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('master.intelligence.vehicleDetail.readOnlyNote' as never)}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('master.intelligence.vehicleDetail.loading' as never)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground" role="alert">
          <p>{t('master.intelligence.vehicleDetail.error' as never)}</p>
          <p className="mt-1 font-mono">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-xs font-medium">{t('master.intelligence.crossLink.vsi' as never)}</p>
            {primaryProfile && lv && rpm ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <SignalProfileBadge kind="lv" profile={lv.profile} limitationCode={lv.limitationCode} />
                  <SignalProfileBadge kind="rpm" profile={rpm.profile} applicability={rpm.applicability} />
                </div>
                {primaryProfile.evaluationBlocked ? (
                  <EvaluationBlockedBanner limitationCode={primaryProfile.evaluationBlockedCodes[0]} />
                ) : null}
                <EvidenceFreshnessHint
                  kind={evidenceKindFromSummary(primaryProfile)}
                  evaluatedAt={primaryProfile.evaluatedAt}
                  providerSourceTimestamp={primaryProfile.lastMaterializedSourceTimestamp}
                  providerFetchedAt={primaryProfile.lastMaterializedProviderFetchAt}
                  profileRevision={primaryProfile.profileRevision}
                />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t('master.intelligence.vsi.noProfiles.body' as never)}
              </p>
            )}
            {primaryLink.ambiguous ? (
              <p className="text-[10px] text-muted-foreground">
                {t('master.intelligence.vehicleDetail.multipleLinks' as never)}
              </p>
            ) : null}
            <button type="button" className="text-xs font-medium text-primary underline" onClick={openVsi}>
              {t('master.intelligence.vehicleDetail.openVsi' as never)}
            </button>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-xs font-medium">{t('master.intelligence.crossLink.apds' as never)}</p>
            {apdsOverview ? (
              <>
                <p className="text-[11px] font-medium">
                  {t(`master.intelligence.apds.availability.${apdsOverview.availability}` as never)}
                </p>
                {apdsOverview.latestDecision ? (
                  <p className="text-[10px] text-muted-foreground">
                    {t('master.intelligence.apds.latestDecision' as never)}:{' '}
                    {apdsOverview.latestDecision.decision} ·{' '}
                    {apdsOverview.latestDecision.opportunityIdPrefix}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    {t('master.intelligence.vehicleDetail.noApdsDecision' as never)}
                  </p>
                )}
                <ShadowVsRealPollHint className="text-[10px]" />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">—</p>
            )}
            <button type="button" className="text-xs font-medium text-primary underline" onClick={openApds}>
              {t('master.intelligence.vehicleDetail.openApds' as never)}
            </button>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-xs font-medium">{t('master.intelligence.crossLink.device' as never)}</p>
            {physicalDevice ? (
              <>
                <p className="text-[11px]">
                  {physicalDevice.modelCode} · {physicalDevice.identityStatus}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground">
                  {physicalDevice.serialNumberMasked ?? '—'}
                </p>
              </>
            ) : pdiNotApplicable ? (
              <p className="text-[11px] text-muted-foreground">
                {t('master.intelligence.pdi.notApplicableR1' as never)}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t('master.intelligence.vehicleDetail.noPhysicalDevice' as never)}
              </p>
            )}
            <button
              type="button"
              className="text-xs font-medium text-primary underline disabled:opacity-50"
              onClick={openPdi}
              disabled={!physicalDevice}
            >
              {t('master.intelligence.vehicleDetail.openPdi' as never)}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
