import { useCallback, useEffect, useMemo, useState } from 'react';
import { BatteryCharging, RefreshCw, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../../components/ui/button';
import { MasterEmptyState, MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { MasterPageHeader, MasterPageSection } from '../shell';
import { fetchOrgVehiclesForHvBatteryInspection } from './vehicle-selection';
import type {
  HvBatteryAdminAvailability,
  HvBatteryAdminChargeEpisodeDetailV1,
  HvBatteryAdminChargeEpisodeListV1,
  HvBatteryAdminOverviewV1,
  HvBatteryAdminTechnicalDetailsV1,
} from './hv-battery-inspection.types';
import {
  formatExclusionList,
  formatM2SummaryLines,
  formatM3ValidationLines,
} from './hv-battery-m2-m3-display.util';

type MasterOrgOption = { id: string; companyName: string };

type Props = {
  organizations: MasterOrgOption[];
};

type TabId = 'overview' | 'history' | 'technical';

function formatAvailability(
  t: (key: string) => string,
  code: HvBatteryAdminAvailability,
): string {
  return t(`master.hvBattery.availability.${code}`);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {hint ? <p className="text-[10px] text-muted-foreground/80 mb-1">{hint}</p> : null}
      <p className="text-sm font-medium tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

export default function HvBatteryInspectionView({ organizations }: Props) {
  const { t } = useLanguage();
  const [organizationId, setOrganizationId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [vehicles, setVehicles] = useState<
    Awaited<ReturnType<typeof fetchOrgVehiclesForHvBatteryInspection>>
  >([]);
  const [tab, setTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<HvBatteryAdminOverviewV1 | null>(null);
  const [episodes, setEpisodes] = useState<HvBatteryAdminChargeEpisodeListV1 | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [episodeDetail, setEpisodeDetail] = useState<HvBatteryAdminChargeEpisodeDetailV1 | null>(
    null,
  );
  const [technical, setTechnical] = useState<HvBatteryAdminTechnicalDetailsV1 | null>(null);
  const [hvSupported, setHvSupported] = useState<boolean | null>(null);

  const filteredVehicles = useMemo(() => {
    const q = vehicleFilter.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const blob = [v.licensePlate, v.vin, v.make, v.model].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [vehicles, vehicleFilter]);

  const loadVehicles = useCallback(async () => {
    if (!organizationId) {
      setVehicles([]);
      return;
    }
    try {
      const list = await fetchOrgVehiclesForHvBatteryInspection(organizationId);
      setVehicles(list);
    } catch {
      setErrorMessage(t('master.hvBattery.errorLoad'));
    }
  }, [organizationId, t]);

  const loadData = useCallback(async () => {
    if (!organizationId || !vehicleId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const ctx = await api.admin.batteryV2.getHvVehicleContext({ organizationId, vehicleId });
      setHvSupported(ctx.hvSupported);
      if (!ctx.hvSupported) {
        setOverview(null);
        setEpisodes(null);
        setTechnical(null);
        setEpisodeDetail(null);
        setErrorMessage(t('master.hvBattery.unsupportedVehicle'));
        return;
      }
      const [ov, ep, tech] = await Promise.all([
        api.admin.batteryV2.getHvOverview({ organizationId, vehicleId }),
        api.admin.batteryV2.listHvChargeEpisodes({ organizationId, vehicleId, page: 1, limit: 50 }),
        api.admin.batteryV2.getHvTechnicalDetails({ organizationId, vehicleId }),
      ]);
      setOverview(ov);
      setEpisodes(ep);
      setTechnical(tech);
      if (selectedEpisodeId) {
        const detail = await api.admin.batteryV2.getHvChargeEpisodeDetail({
          organizationId,
          vehicleId,
          episodeId: selectedEpisodeId,
        });
        setEpisodeDetail(detail);
      } else {
        setEpisodeDetail(null);
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : t('master.hvBattery.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, vehicleId, selectedEpisodeId, t]);

  useEffect(() => {
    void loadVehicles();
    setVehicleId('');
    setOverview(null);
    setEpisodes(null);
    setTechnical(null);
    setEpisodeDetail(null);
    setHvSupported(null);
  }, [organizationId, loadVehicles]);

  useEffect(() => {
    if (vehicleId) void loadData();
  }, [vehicleId, loadData]);

  const selectEpisode = async (episodeId: string) => {
    setSelectedEpisodeId(episodeId);
    if (!organizationId || !vehicleId) return;
    try {
      const detail = await api.admin.batteryV2.getHvChargeEpisodeDetail({
        organizationId,
        vehicleId,
        episodeId,
      });
      setEpisodeDetail(detail);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : t('master.hvBattery.errorLoad'));
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <MasterPageHeader
        title={t('master.hvBattery.pageTitle')}
        description={t('master.hvBattery.pageDescription')}
        icon={BatteryCharging}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!vehicleId || loading}
            onClick={() => void loadData()}
            aria-label={t('master.hvBattery.refreshAria')}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('master.hvBattery.refreshAria')}
          </Button>
        }
      />

      <MasterPageSection title={t('master.hvBattery.targetSelection')}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('master.hvBattery.organization')}</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-2"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
            >
              <option value="">{t('master.hvBattery.selectOrganization')}</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.companyName}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">{t('master.hvBattery.vehicle')}</span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-2"
                  placeholder={t('master.hvBattery.filterVehiclePlaceholder')}
                  value={vehicleFilter}
                  onChange={(e) => setVehicleFilter(e.target.value)}
                />
              </div>
              <select
                className="min-w-[200px] rounded-md border border-border bg-background px-2 py-2"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                disabled={!organizationId}
              >
                <option value="">{t('master.hvBattery.selectVehicle')}</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.licensePlate, v.make, v.model].filter(Boolean).join(' · ') || v.id}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      </MasterPageSection>

      {!vehicleId ? (
        <MasterEmptyState
          title={t('master.hvBattery.emptyNoVehicleTitle')}
          description={t('master.hvBattery.emptyNoVehicleDescription')}
        />
      ) : loading && !overview ? (
        <MasterLoadingState />
      ) : errorMessage && hvSupported === false ? (
        <MasterErrorState title={t('master.hvBattery.errorLoad')} description={errorMessage} />
      ) : errorMessage ? (
        <MasterErrorState title={t('master.hvBattery.errorLoad')} description={errorMessage} />
      ) : (
        <>
          <div className="flex gap-2 border-b border-border pb-2">
            {(['overview', 'history', 'technical'] as TabId[]).map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={tab === id ? 'default' : 'ghost'}
                onClick={() => setTab(id)}
              >
                {t(`master.hvBattery.tab.${id}`)}
              </Button>
            ))}
          </div>

          {tab === 'overview' && overview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Metric
                  label={t('master.hvBattery.metric.physicalEpisodes')}
                  hint={t('master.hvBattery.metric.physicalEpisodesHelp')}
                  value={overview.physicalChargeEpisodeCount}
                />
                <Metric
                  label={t('master.hvBattery.metric.providerSegments')}
                  value={overview.rawProviderSegmentCount}
                />
                <Metric
                  label={t('master.hvBattery.metric.socAvailability')}
                  value={formatAvailability(t, overview.socDataAvailability)}
                />
                <Metric
                  label={t('master.hvBattery.metric.energyAvailability')}
                  value={formatAvailability(t, overview.energyDataAvailability)}
                />
              </div>
              <MasterPageSection title={t('master.hvBattery.metric.lastCharge')}>
                {overview.lastCompletedCharge ? (
                  <p className="text-sm tabular-nums">
                    {new Date(overview.lastCompletedCharge.endedAt).toLocaleString()} · SOC{' '}
                    {overview.lastCompletedCharge.startSocPercent ?? '—'}→
                    {overview.lastCompletedCharge.endSocPercent ?? '—'} ·{' '}
                    {overview.lastCompletedCharge.energyAddedKwh != null
                      ? `${overview.lastCompletedCharge.energyAddedKwh.toFixed(1)} kWh`
                      : formatAvailability(t, 'NOT_AVAILABLE')}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {formatAvailability(t, 'NOT_AVAILABLE')}
                  </p>
                )}
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.metric.measurementQuality')}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric
                    label={t('master.hvBattery.metric.qualityLevel')}
                    value={overview.measurementQuality.vehicleQualityLevel}
                  />
                  <Metric
                    label={t('master.hvBattery.metric.qualityScore')}
                    value={overview.measurementQuality.qualityScore}
                  />
                  <Metric
                    label={t('master.hvBattery.metric.capacityConfidence')}
                    value={overview.measurementQuality.capacityConfidence}
                  />
                  <Metric
                    label={t('master.hvBattery.metric.sohReadiness')}
                    value={overview.measurementQuality.sohPublicationReadiness}
                  />
                </div>
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.metric.capacityEvidence')}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Metric
                    label={t('master.hvBattery.metric.status')}
                    value={formatAvailability(t, overview.capacityEvidence.crossSessionAvailability)}
                  />
                  <Metric
                    label={t('master.hvBattery.metric.shadowGate')}
                    value={
                      overview.capacityEvidence.shadowGatePassed
                        ? t('master.hvBattery.metric.shadowGatePass')
                        : t('master.hvBattery.metric.shadowGateFail')
                    }
                  />
                  <Metric
                    label={t('master.hvBattery.metric.estimatedKwh')}
                    value={
                      overview.capacityEvidence.estimatedUsableCapacityKwh != null
                        ? overview.capacityEvidence.estimatedUsableCapacityKwh.toFixed(2)
                        : formatAvailability(t, 'NOT_CALCULATED')
                    }
                  />
                </div>
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.metric.sohEvidence')}>
                <p className="text-xs text-muted-foreground mb-2">{overview.sohEvidence.disclaimer}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Metric
                    label={t('master.hvBattery.metric.availability')}
                    value={formatAvailability(t, overview.sohEvidence.availability)}
                  />
                  <Metric
                    label={t('master.hvBattery.metric.internalSoh')}
                    value={
                      overview.sohEvidence.internalEstimatedSohPercent != null
                        ? overview.sohEvidence.internalEstimatedSohPercent.toFixed(1)
                        : formatAvailability(t, 'NOT_CALCULATED')
                    }
                  />
                  <Metric
                    label={t('master.hvBattery.metric.presentation')}
                    value={overview.sohEvidence.presentation}
                  />
                </div>
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.metric.snapshotCoverage')}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Metric
                    label={t('master.hvBattery.metric.snapshotCount30d')}
                    value={overview.snapshotCoverage.snapshotsLast30Days}
                  />
                  <Metric
                    label={t('master.hvBattery.metric.latest')}
                    value={
                      overview.snapshotCoverage.latestRecordedAt
                        ? new Date(overview.snapshotCoverage.latestRecordedAt).toLocaleString()
                        : formatAvailability(t, 'NOT_AVAILABLE')
                    }
                  />
                  <Metric
                    label={t('master.hvBattery.metric.latestSoc')}
                    value={overview.snapshotCoverage.latestSocPercent ?? formatAvailability(t, 'NOT_MEASURED')}
                  />
                  <Metric
                    label={t('master.hvBattery.metric.latestEnergy')}
                    value={
                      overview.snapshotCoverage.latestEnergyKwh != null
                        ? `${overview.snapshotCoverage.latestEnergyKwh.toFixed(1)} kWh`
                        : formatAvailability(t, 'NOT_MEASURED')
                    }
                  />
                </div>
              </MasterPageSection>
            </div>
          )}

          {tab === 'history' && episodes && (
            <div className="grid gap-4 lg:grid-cols-2">
              <MasterPageSection title={t('master.hvBattery.tab.history')}>
                {episodes.episodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('master.hvBattery.history.noEpisodes')}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2">{t('master.hvBattery.table.start')}</th>
                        <th>{t('master.hvBattery.table.soc')}</th>
                        <th>{t('master.hvBattery.table.energy')}</th>
                        <th>{t('master.hvBattery.table.segments')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {episodes.episodes.map((ep) => (
                        <tr
                          key={ep.episodeId}
                          className={`border-b border-border/40 cursor-pointer hover:bg-muted/40 ${selectedEpisodeId === ep.episodeId ? 'bg-muted/60' : ''}`}
                          onClick={() => void selectEpisode(ep.episodeId)}
                        >
                          <td className="py-2 tabular-nums">{new Date(ep.startAt).toLocaleString()}</td>
                          <td className="tabular-nums">
                            {ep.deltaSocPercent != null ? `${ep.deltaSocPercent.toFixed(0)}%` : '—'}
                          </td>
                          <td className="tabular-nums">
                            {ep.energyAddedKwh != null ? `${ep.energyAddedKwh.toFixed(1)} kWh` : '—'}
                          </td>
                          <td>{ep.providerSegmentCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.detail.providerSegments')}>
                {!episodeDetail ? (
                  <p className="text-sm text-muted-foreground">
                    {t('master.hvBattery.history.selectEpisode')}
                  </p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <p className="tabular-nums text-muted-foreground">
                      {t('master.hvBattery.table.duration')}:{' '}
                      {formatDuration(episodeDetail.summary.durationSeconds)} ·{' '}
                      {t('master.hvBattery.table.status')}: {episodeDetail.summary.sessionStatus}
                    </p>
                    <ul className="space-y-2">
                      {episodeDetail.providerSegments.map((seg) => (
                        <li key={seg.sessionId} className="rounded border border-border/50 p-2">
                          <p className="font-mono text-xs">{seg.source}</p>
                          <p className="tabular-nums">
                            {new Date(seg.startAt).toLocaleString()} —{' '}
                            {seg.endAt ? new Date(seg.endAt).toLocaleString() : 'ongoing'}
                          </p>
                          {seg.isSuperseded ? (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              {t('master.hvBattery.segment.superseded')}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric
                        label={t('master.hvBattery.detail.m2')}
                        value={formatAvailability(t, episodeDetail.m2.availability)}
                      />
                      <Metric
                        label={t('master.hvBattery.detail.m3')}
                        value={formatAvailability(t, episodeDetail.m3.availability)}
                      />
                      <Metric
                        label={t('master.hvBattery.detail.observationCount')}
                        value={episodeDetail.m2.observationCount}
                      />
                    </div>
                    <MasterPageSection title={t('master.hvBattery.detail.m2')}>
                      {formatM2SummaryLines(episodeDetail.m2.summary).length > 0 ? (
                        <ul className="list-disc pl-4 space-y-1 text-xs font-mono">
                          {formatM2SummaryLines(episodeDetail.m2.summary).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('master.hvBattery.m2.noData')}</p>
                      )}
                    </MasterPageSection>
                    <MasterPageSection title={t('master.hvBattery.detail.m3')}>
                      {formatM3ValidationLines(episodeDetail.m3.validation).length > 0 ? (
                        <ul className="list-disc pl-4 space-y-1 text-xs font-mono">
                          {formatM3ValidationLines(episodeDetail.m3.validation).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('master.hvBattery.m3.noData')}</p>
                      )}
                    </MasterPageSection>
                    {episodeDetail.measurementQuality ? (
                      <MasterPageSection title={t('master.hvBattery.exclusion.title')}>
                        <p className="text-sm">
                          {episodeDetail.measurementQuality.qualityLevel} ·{' '}
                          {episodeDetail.measurementQuality.qualityScore}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatExclusionList(episodeDetail.measurementQuality.exclusionReasons)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatExclusionList(episodeDetail.measurementQuality.qualityReasonCodes)}
                        </p>
                      </MasterPageSection>
                    ) : null}
                  </div>
                )}
              </MasterPageSection>
            </div>
          )}

          {tab === 'technical' && technical && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{technical.sohAssessment.disclaimer}</p>
              <MasterPageSection title={t('master.hvBattery.technical.crossSession')}>
                <p className="text-sm mb-2">
                  {formatAvailability(t, technical.crossSessionAssessment.availability)}
                </p>
                {technical.crossSessionAssessment.persisted ? (
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t('master.hvBattery.metric.estimatedKwh')}</dt>
                      <dd className="tabular-nums font-medium">
                        {typeof technical.crossSessionAssessment.persisted.scoreValue === 'number'
                          ? Number(technical.crossSessionAssessment.persisted.scoreValue).toFixed(2)
                          : formatAvailability(t, 'NOT_CALCULATED')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('master.hvBattery.metric.status')}</dt>
                      <dd>{String(technical.crossSessionAssessment.persisted.confidence ?? '—')}</dd>
                    </div>
                  </dl>
                ) : null}
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-muted-foreground">
                    {t('master.hvBattery.technical.rawJson')}
                  </summary>
                  <pre className="text-xs overflow-auto max-h-48 rounded bg-muted/40 p-2 mt-1">
                    {JSON.stringify(technical.crossSessionAssessment.persisted, null, 2)}
                  </pre>
                </details>
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.metric.sohEvidence')}>
                <Metric
                  label={t('master.hvBattery.metric.internalSoh')}
                  value={
                    technical.sohAssessment.internalEstimatedSohPercent != null
                      ? technical.sohAssessment.internalEstimatedSohPercent.toFixed(1)
                      : formatAvailability(t, 'NOT_CALCULATED')
                  }
                />
                {technical.sohAssessment.gateReasonCodes.length > 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatExclusionList(technical.sohAssessment.gateReasonCodes)}
                  </p>
                ) : null}
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-muted-foreground">
                    {t('master.hvBattery.technical.rawJson')}
                  </summary>
                  <pre className="text-xs overflow-auto max-h-48 rounded bg-muted/40 p-2 mt-1">
                    {JSON.stringify(technical.sohAssessment.persisted, null, 2)}
                  </pre>
                </details>
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.technical.reference')}>
                <Metric
                  label={t('master.hvBattery.metric.kwh')}
                  value={
                    technical.referenceCapacity.capacityKwh != null
                      ? technical.referenceCapacity.capacityKwh
                      : formatAvailability(t, technical.referenceCapacity.availability)
                  }
                />
              </MasterPageSection>
              <MasterPageSection title={t('master.hvBattery.technical.flags')}>
                <ul className="text-sm space-y-1">
                  {Object.entries(technical.featureFlags).map(([key, value]) => (
                    <li key={key}>
                      <span className="font-mono text-xs">{key}</span>:{' '}
                      <span className="tabular-nums">{String(value)}</span>
                    </li>
                  ))}
                </ul>
              </MasterPageSection>
            </div>
          )}
        </>
      )}
    </div>
  );
}
