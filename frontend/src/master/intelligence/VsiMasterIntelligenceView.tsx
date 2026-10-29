import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MasterPageHeader, MasterPageSection } from '../shell';
import { MasterIntelligenceContextProvider } from './MasterIntelligenceContextProvider';
import { useMasterIntelligenceContext } from './useMasterIntelligenceContext';
import { IntelligenceCrossLink } from './IntelligenceCrossLink';
import { IntelligenceEmptyState } from './IntelligenceEmptyState';
import {
  EvaluationBlockedBanner,
  EvidenceFreshnessHint,
} from './EvidenceFreshnessHint';
import {
  ObservedDensityBadge,
  ProfileConfidenceIndicator,
  SignalProfileBadge,
} from './SignalProfileBadge';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { cn } from '../../components/ui/utils';
import { useVsiMasterIntelligenceData } from './useVsiMasterIntelligenceData';
import {
  evidenceKindFromSummary,
  mapConfidenceLevel,
  mapObservedDensity,
  mapSummaryToLvBadge,
  mapSummaryToRpmBadge,
} from './vsi-master-intelligence-ui.utils';
import type { MasterVsiProfileSummaryDto } from './vsi-master-intelligence-api.types';
import { resolvePhysicalDeviceIdForVehicle } from './resolve-vehicle-physical-device';

function formatUtcProvenance(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const d = new Date(ms);
  return `${d.toISOString()} (${d.toLocaleString(locale)})`;
}

function ProfileSummaryCard({ profile }: { profile: MasterVsiProfileSummaryDto }) {
  const { t } = useLanguage();
  const lv = mapSummaryToLvBadge(profile);
  const rpm = mapSummaryToRpmBadge(profile);

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-3 text-xs">
      <p className="font-medium">{profile.provider ?? profile.providerIdentity}</p>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{profile.providerSourceLinkId}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <SignalProfileBadge kind="lv" profile={lv.profile} limitationCode={lv.limitationCode} />
        <SignalProfileBadge kind="rpm" profile={rpm.profile} applicability={rpm.applicability} />
        {profile.observedDensityLabel ? (
          <ObservedDensityBadge density={mapObservedDensity(profile.observedDensityLabel)} />
        ) : null}
        {profile.lvEvidenceConfidence ? (
          <ProfileConfidenceIndicator level={mapConfidenceLevel(profile.lvEvidenceConfidence)} />
        ) : null}
      </div>
      {profile.evaluationBlocked ? (
        <EvaluationBlockedBanner
          limitationCode={profile.evaluationBlockedCodes[0]}
          className="mt-3"
        />
      ) : null}
      <EvidenceFreshnessHint
        className="mt-3"
        kind={evidenceKindFromSummary(profile)}
        evaluatedAt={profile.evaluatedAt}
        providerSourceTimestamp={profile.lastMaterializedSourceTimestamp}
        providerFetchedAt={profile.lastMaterializedProviderFetchAt}
        profileRevision={profile.profileRevision}
      />
      {profile.lvClassificationDecisionCode ? (
        <p className="mt-2 text-muted-foreground">
          {t('master.intelligence.vsi.decision.lv' as never, {
            code: profile.lvClassificationDecisionCode,
          })}
        </p>
      ) : null}
      {profile.rpmClassificationDecisionCode ? (
        <p className="text-muted-foreground">
          {t('master.intelligence.vsi.decision.rpm' as never, {
            code: profile.rpmClassificationDecisionCode,
          })}
        </p>
      ) : null}
    </div>
  );
}

function VsiMasterIntelligenceContent() {
  const { t, locale } = useLanguage();
  const { context, setContextInUrl } = useMasterIntelligenceContext();
  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [vehicleOptions, setVehicleOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [scopeLoading, setScopeLoading] = useState(false);

  const { overview, profile, revisions, revisionAsOf, capabilityExplanation, loading, error, refresh } =
    useVsiMasterIntelligenceData({
      orgId: context.orgId,
      vehicleId: context.vehicleId,
      providerSourceLinkId: context.providerSourceLinkId,
      asOf: context.asOf,
    });

  useEffect(() => {
    if (context.providerSourceLinkId || !context.orgId || !context.vehicleId) return;
    const first = overview?.profiles[0]?.providerSourceLinkId;
    if (first) {
      setContextInUrl({ providerSourceLinkId: first }, { replace: true });
    }
  }, [context.orgId, context.vehicleId, context.providerSourceLinkId, overview, setContextInUrl]);

  useEffect(() => {
    if (!context.orgId || !context.vehicleId || context.physicalDeviceId) return;
    void resolvePhysicalDeviceIdForVehicle(context.orgId, context.vehicleId).then((id) => {
      if (id) setContextInUrl({ physicalDeviceId: id }, { replace: true });
    });
  }, [context.orgId, context.vehicleId, context.physicalDeviceId, setContextInUrl]);

  const linkOptions = useMemo(
    () =>
      (overview?.profiles ?? []).map((p) => ({
        id: p.providerSourceLinkId,
        label: `${p.provider ?? p.providerIdentity} · rev ${p.profileRevision}`,
      })),
    [overview],
  );

  const selectedLinkId =
    context.providerSourceLinkId ?? overview?.profiles[0]?.providerSourceLinkId ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setScopeLoading(true);
      try {
        const res = await api.organizations.listOperational({ limit: 100, page: 1 });
        if (cancelled) return;
        setOrgOptions(
          res.data.map((o) => ({
            id: o.id,
            label: o.companyName ?? o.id,
          })),
        );
      } catch {
        if (!cancelled) setOrgOptions([]);
      } finally {
        if (!cancelled) setScopeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!context.orgId) {
      setVehicleOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.vehicles.listByOrg(context.orgId!, { limit: 200 });
        if (cancelled) return;
        setVehicleOptions(
          res.data.map((v: { id: string; make?: string; model?: string; licensePlate?: string }) => ({
            id: v.id,
            label: [v.make, v.model, v.licensePlate].filter(Boolean).join(' · ') || v.id,
          })),
        );
      } catch {
        if (!cancelled) setVehicleOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context.orgId]);

  const onOrgChange = useCallback(
    (orgId: string) => {
      setContextInUrl({ orgId: orgId || null, vehicleId: null, providerSourceLinkId: null });
    },
    [setContextInUrl],
  );

  const onVehicleChange = useCallback(
    (vehicleId: string) => {
      setContextInUrl({ vehicleId: vehicleId || null, providerSourceLinkId: null });
    },
    [setContextInUrl],
  );

  const onLinkChange = useCallback(
    (providerSourceLinkId: string) => {
      setContextInUrl({ providerSourceLinkId: providerSourceLinkId || null });
    },
    [setContextInUrl],
  );

  const hasScope = Boolean(context.orgId && context.vehicleId);

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

      <MasterPageSection title={t('master.intelligence.section.fleetOverview' as never)}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('master.intelligence.vsi.picker.org' as never)}</span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={context.orgId ?? ''}
              onChange={(e) => onOrgChange(e.target.value)}
              disabled={scopeLoading}
            >
              <option value="">—</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {t('master.intelligence.vsi.picker.vehicle' as never)}
            </span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={context.vehicleId ?? ''}
              onChange={(e) => onVehicleChange(e.target.value)}
              disabled={!context.orgId}
            >
              <option value="">—</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('master.intelligence.vsi.picker.link' as never)}</span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={selectedLinkId ?? ''}
              onChange={(e) => onLinkChange(e.target.value)}
              disabled={!hasScope || linkOptions.length === 0}
            >
              <option value="">—</option>
              {linkOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('master.intelligence.vsi.loading' as never)}
          </p>
        ) : null}
        {error ? (
          <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <p>{t('master.intelligence.vsi.error' as never)}</p>
            <p className="mt-1 font-mono">{error}</p>
            <button type="button" className="mt-2 underline" onClick={() => void refresh()}>
              {t('master.intelligence.vsi.retry' as never)}
            </button>
          </div>
        ) : null}

        {!hasScope ? (
          <IntelligenceEmptyState
            titleKey="master.intelligence.vsi.empty.selectScope.title"
            bodyKey="master.intelligence.vsi.empty.selectScope.body"
            className="mt-4"
          />
        ) : null}

        {hasScope && !loading && !error && overview && overview.profiles.length === 0 ? (
          <IntelligenceEmptyState
            titleKey="master.intelligence.vsi.noProfiles.title"
            bodyKey="master.intelligence.vsi.noProfiles.body"
            className="mt-4"
          />
        ) : null}

        {overview && overview.profiles.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {overview.profiles.map((p) => (
              <ProfileSummaryCard key={p.providerSourceLinkId} profile={p} />
            ))}
          </div>
        ) : null}
      </MasterPageSection>

      {profile ? (
        <MasterPageSection title={t('master.intelligence.section.signals' as never)}>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('master.intelligence.vsi.signals.intro' as never)}
          </p>
          <div className="overflow-x-auto rounded border border-border/60">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">{t('master.intelligence.vsi.signals.canonical' as never)}</th>
                  <th className="px-2 py-1.5">{t('master.intelligence.vsi.signals.provider' as never)}</th>
                  <th className="px-2 py-1.5">{t('master.intelligence.vsi.signals.quality' as never)}</th>
                  <th className="px-2 py-1.5">{t('master.intelligence.vsi.signals.observedAt' as never)}</th>
                  <th className="px-2 py-1.5">{t('master.intelligence.vsi.signals.limitations' as never)}</th>
                </tr>
              </thead>
              <tbody>
                {profile.signals.map((signal) => (
                  <tr key={signal.canonicalSignalKey} className="border-t border-border/40">
                    <td className="px-2 py-1.5 font-mono">{signal.canonicalSignalKey}</td>
                    <td className="px-2 py-1.5">{signal.providerNativeSignalName}</td>
                    <td className="px-2 py-1.5">
                      {signal.qualityClassification ?? '—'} / {signal.confidenceLevel ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {formatUtcProvenance(signal.lastValidObservationAt, locale)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {signal.limitations.length ? signal.limitations.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MasterPageSection>
      ) : null}

      {revisions ? (
        <MasterPageSection title={t('master.intelligence.section.revisions' as never)}>
          {revisions.captureStatus === 'NOT_CAPTURED' ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs" role="status">
              <p className="font-medium">{t('master.intelligence.vsi.revision.notCaptured' as never)}</p>
              <p className="mt-1 text-muted-foreground">
                {t('master.intelligence.vsi.revision.notCapturedExplain' as never)}
              </p>
            </div>
          ) : (
            <>
              <ul className="space-y-2 text-xs">
                {revisions.items.map((item) => (
                  <li
                    key={item.profileRevision}
                    className="rounded border border-border/50 px-2 py-1.5 font-mono"
                  >
                    rev {item.profileRevision} · LV {item.lvStandbyProfile} · RPM {item.rpmActiveProfile}
                    <span className="ml-2 text-muted-foreground">
                      {formatUtcProvenance(item.evaluatedAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
              {revisions.page.hasMore ? (
                <p className="mt-2 text-muted-foreground">
                  {t('master.intelligence.vsi.revision.moreAvailable' as never)}
                </p>
              ) : null}
            </>
          )}
        </MasterPageSection>
      ) : null}

      {revisionAsOf && context.asOf ? (
        <MasterPageSection title={t('master.intelligence.vsi.asOf.title' as never)}>
          <p className="text-xs text-muted-foreground">
            {t('master.intelligence.vsi.asOf.decisionAt' as never)}:{' '}
            {formatUtcProvenance(revisionAsOf.decisionAt, locale)}
          </p>
          <p className="mt-1 text-xs">
            {t('master.intelligence.vsi.asOf.authority' as never)}: {revisionAsOf.authority}
          </p>
          {revisionAsOf.selectedRevision ? (
            <p className="mt-1 font-mono text-xs">
              rev {revisionAsOf.selectedRevision.profileRevision} · LV{' '}
              {revisionAsOf.selectedRevision.lvStandbyProfile}
            </p>
          ) : null}
        </MasterPageSection>
      ) : null}

      {capabilityExplanation ? (
        <MasterPageSection title={t('master.intelligence.section.capability' as never)}>
          <pre
            className={cn(
              'max-h-64 overflow-auto rounded border border-border/50 bg-muted/20 p-2 text-[10px]',
            )}
          >
            {JSON.stringify(capabilityExplanation, null, 2)}
          </pre>
        </MasterPageSection>
      ) : null}

      <MasterPageSection title={t('master.intelligence.section.crossLinks' as never)}>
        <div className="flex flex-wrap gap-2">
          <IntelligenceCrossLink target="vehicles" />
          <IntelligenceCrossLink target="device-inventory" />
          <IntelligenceCrossLink target="apds-intelligence" />
        </div>
      </MasterPageSection>
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
