import { useCallback, useEffect, useMemo, useState } from 'react';
import { Battery, RefreshCw, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { MasterEmptyState, MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { MasterPageHeader, MasterPageSection } from '../shell';
import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';
import { RetentionPointsTable } from './RetentionPointsTable';
import { fetchOrgVehiclesForBatteryV2Inspection } from './vehicle-selection';
import {
  formatMillivolts,
  formatSlope,
  retentionPointsFromInputSummary,
  type BatteryV2RestSessionListItemV1,
  type RestSessionFeatureShadowInspectionOverallStatus,
  type RestSessionFeatureShadowInspectionV1,
} from './types';

type MasterOrgOption = { id: string; companyName: string };

type Props = {
  isDarkMode: boolean;
  organizations: MasterOrgOption[];
};

type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';

function integrityLabel(status: RestSessionFeatureShadowInspectionOverallStatus): string {
  switch (status) {
    case 'OK':
      return 'OK';
    case 'INTEGRITY_PARTIAL':
      return 'INTEGRITY_PARTIAL';
    case 'INTEGRITY_WARNING':
      return 'INTEGRITY_WARNING';
    case 'NO_FEATURE_ROWS':
      return 'NO_FEATURE_ROWS';
    default:
      return status;
  }
}

function integrityClass(status: RestSessionFeatureShadowInspectionOverallStatus): string {
  switch (status) {
    case 'OK':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'INTEGRITY_PARTIAL':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
    case 'INTEGRITY_WARNING':
      return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';
    case 'NO_FEATURE_ROWS':
      return 'border-muted bg-muted/40 text-muted-foreground';
    default:
      return 'border-border bg-muted/30';
  }
}

function Metric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/60 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

function RevisionFeatures({
  title,
  revision,
  isCanonical,
}: {
  title: string;
  revision: RestSessionFeatureShadowInspectionV1['canonicalFeature'];
  isCanonical: boolean;
}) {
  if (!revision) return null;
  const retentionPoints = retentionPointsFromInputSummary(revision.inputSummary);
  return (
    <MasterPageSection title={title}>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
        <span>rev {revision.semanticRevision}</span>
        <span>{revision.computationPhase}</span>
        <span>{revision.sessionTrust}</span>
        {isCanonical && (
          <span className="font-semibold text-foreground">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.canonicalTag')}</span>
        )}
        <span>
          digest{' '}
          {revision.digestValid
            ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.digestValid')
            : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.digestMismatch')}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.shutdownRestDelta')}
          value={formatMillivolts(revision.shutdownToFirstRestDeltaMv)}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.theilSenSlope')}
          value={formatSlope(revision.robustRestSlopeMvPerHour)}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.medianRestV')}
          value={formatMillivolts(revision.medianRestVoltageMv)}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.validRestPoints')}
          value={revision.numberOfValidRestPoints}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.minRestV')}
          value={formatMillivolts(revision.minimumRestVoltageMv)}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.maxRestV')}
          value={formatMillivolts(revision.maximumRestVoltageMv)}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.variance')}
          value={revision.restVoltageVarianceMv2}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.missingRungs')}
          value={revision.missingRungCount}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.chargeClass')}
          value={revision.chargeOpportunityClass}
        />
        <Metric
          label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.observationSpan')}
          value={revision.observationSpanMs != null ? `${revision.observationSpanMs} ms` : '—'}
        />
      </div>
      {retentionPoints.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionSectionTitle')}</p>
          <RetentionPointsTable points={retentionPoints} />
        </div>
      )}
    </MasterPageSection>
  );
}

export default function BatteryV2ShadowInspectionView({ organizations }: Props) {
  const [organizationId, setOrganizationId] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [sessions, setSessions] = useState<BatteryV2RestSessionListItemV1[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [restSessionId, setRestSessionId] = useState('');
  const [inspection, setInspection] = useState<RestSessionFeatureShadowInspectionV1 | null>(null);
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (organizationId && v.organizationId !== organizationId) return false;
      if (!q) return true;
      return (
        String(v.licensePlate ?? '').toLowerCase().includes(q) ||
        String(v.vin ?? '').toLowerCase().includes(q) ||
        String(v.make ?? '').toLowerCase().includes(q)
      );
    });
  }, [vehicles, organizationId, vehicleSearch]);

  const loadVehiclesForOrganization = useCallback(async (orgId: string) => {
    if (!orgId) {
      setVehicles([]);
      return;
    }
    setVehiclesLoading(true);
    try {
      const rows = await fetchOrgVehiclesForBatteryV2Inspection(orgId);
      setVehicles(rows);
    } catch {
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    setVehicleId('');
    void loadVehiclesForOrganization(organizationId);
  }, [organizationId, loadVehiclesForOrganization]);

  const loadSessions = useCallback(async () => {
    if (!organizationId || !vehicleId) {
      setSessions([]);
      return;
    }
    setSessionsLoading(true);
    try {
      const res = await api.admin.batteryV2.listRestSessions({ organizationId, vehicleId, limit: 40 });
      setSessions(res.sessions);
      if (res.sessions.length === 1) setRestSessionId(res.sessions[0].id);
    } catch {
      setSessions([]);
      setErrorMessage(resolveBatteryV2ShadowCopy('master.batteryV2Shadow.errorSessionsLoad'));
    } finally {
      setSessionsLoading(false);
    }
  }, [organizationId, vehicleId]);

  useEffect(() => {
    setRestSessionId('');
    setInspection(null);
    setPhase('idle');
    void loadSessions();
  }, [loadSessions]);

  const runInspection = useCallback(async () => {
    if (!organizationId || !vehicleId || !restSessionId) {
      setPhase('idle');
      setInspection(null);
      return;
    }
    setPhase('loading');
    setErrorMessage(null);
    try {
      const data = await api.admin.batteryV2.inspectRestSessionFeature({
        organizationId,
        vehicleId,
        restSessionId,
      });
      setInspection(data);
      setPhase('ready');
    } catch (e: unknown) {
      setInspection(null);
      setPhase('error');
      setErrorMessage(e instanceof Error ? e.message : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.errorInspectionRequest'));
    }
  }, [organizationId, vehicleId, restSessionId]);

  useEffect(() => {
    void runInspection();
  }, [runInspection]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  return (
    <>
      <MasterPageHeader
        title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.pageTitle')}
        description={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.pageDescription')}
        icon={<Battery className="w-6 h-6 text-status-info" />}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void runInspection()}
            aria-label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.refreshAria')}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.targetSelection')}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.organization')}</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={organizationId}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setVehicleId('');
              }}
            >
              <option value="">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.selectOrganization')}</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.companyName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 md:col-span-2">
            <span className="text-muted-foreground">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.vehicle')}</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm mb-2"
                placeholder={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.filterVehiclePlaceholder')}
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
              />
            </div>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={vehicleId}
              disabled={!organizationId || vehiclesLoading}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.selectVehicle')}</option>
              {filteredVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {[v.licensePlate, v.make, v.model].filter(Boolean).join(' · ') || v.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 md:col-span-3">
            <span className="text-muted-foreground">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.restSession')}</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={restSessionId}
              disabled={!vehicleId || sessionsLoading}
              onChange={(e) => setRestSessionId(e.target.value)}
            >
              <option value="">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.selectRestSession')}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sessionStatus} · opened {new Date(s.openedAt).toLocaleString()} · {s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </MasterPageSection>

      {!organizationId || !vehicleId ? (
        <MasterEmptyState
          title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.emptyNoVehicleTitle')}
          description={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.emptyNoVehicleDescription')}
        />
      ) : !restSessionId ? (
        <MasterEmptyState
          title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.emptyNoSessionTitle')}
          description={
            sessions.length === 0
              ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.emptyNoSessionsFound')
              : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.emptySelectSession')
          }
        />
      ) : phase === 'loading' ? (
        <MasterLoadingState variant="card" count={3} />
      ) : phase === 'error' ? (
        <MasterErrorState
          title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.errorInspectionTitle')}
          description={errorMessage ?? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.errorUnknown')}
          onRetry={() => void runInspection()}
        />
      ) : inspection ? (
        <div className="space-y-4">
          <div className={`rounded-xl border px-4 py-3 ${integrityClass(inspection.integrity.overallStatus)}`}>
            <p className="text-sm font-semibold">
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.integrityPrefix')} {integrityLabel(inspection.integrity.overallStatus)}
            </p>
            <p className="text-xs mt-1 opacity-90">
              Contract {inspection.inspectionContractVersion} · digest scope {inspection.integrity.digestVerificationScope} · checked{' '}
              {inspection.integrity.digestRowsChecked}/{inspection.featureSummary.totalRows} rows · mismatches{' '}
              {inspection.integrity.digestMismatchCount}
            </p>
          </div>

          <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.sessionIdentity')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.vehicle')}
                value={selectedVehicle?.licensePlate ?? inspection.session.vehicleId}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.sessionStatus')}
                value={inspection.session.sessionStatus}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.anchor')}
                value={`${inspection.session.anchorType} @ ${new Date(inspection.session.anchorAt).toLocaleString()}`}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.endReason')}
                value={inspection.session.endReason ?? '—'}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.restObservations')}
                value={`${inspection.session.validRestObservationCount}/${inspection.session.restObservationCount}`}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.sessionId')}
                value={inspection.session.id}
              />
            </div>
          </MasterPageSection>

          <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.canonicalState')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.canonicalRevision')}
                value={inspection.featureSummary.canonicalSemanticRevision}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.canonicalRowId')}
                value={inspection.featureSummary.canonicalFeatureRowId?.slice(0, 12) ?? '—'}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.selection')}
                value={inspection.integrity.canonicalSelectionStatus}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.latestSemanticRev')}
                value={inspection.featureSummary.latestSemanticRevision}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.totalFeatureRows')}
                value={inspection.featureSummary.totalRows}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.windowTruncated')}
                value={
                  inspection.featureSummary.revisionsTruncated
                    ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.yesLatest100')
                    : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.no')
                }
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.countAggregateConsistent')}
                value={
                  inspection.integrity.countAggregateConsistent
                    ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.yes')
                    : 'NO'
                }
              />
            </div>
          </MasterPageSection>

          <RevisionFeatures
            title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.canonicalFeatureTitle')}
            revision={inspection.canonicalFeature}
            isCanonical
          />

          {inspection.canonicalFeature?.chargeOpportunityRaw != null && (
            <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.chargeContextTitle')}>
              <pre className="text-xs overflow-auto max-h-48 rounded-lg border border-border p-3 bg-muted/30">
                {JSON.stringify(inspection.canonicalFeature.chargeOpportunityRaw, null, 2)}
              </pre>
            </MasterPageSection>
          )}

          <MasterPageSection
            title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.revisionHistoryTitle', {
              count: inspection.revisions.length,
            })}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.table.rev')}</th>
                    <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.table.phase')}</th>
                    <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.table.trust')}</th>
                    <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.table.digest')}</th>
                    <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.table.slope')}</th>
                    <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.table.canonical')}</th>
                  </tr>
                </thead>
                <tbody>
                  {inspection.revisions.map((row) => (
                    <tr key={row.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 tabular-nums">{row.semanticRevision}</td>
                      <td className="py-1.5 pr-2">{row.computationPhase}</td>
                      <td className="py-1.5 pr-2">{row.sessionTrust}</td>
                      <td className="py-1.5 pr-2">{row.digestValid ? 'ok' : 'fail'}</td>
                      <td className="py-1.5 pr-2">{formatSlope(row.robustRestSlopeMvPerHour)}</td>
                      <td className="py-1.5 pr-2">
                        {row.id === inspection.featureSummary.canonicalFeatureRowId
                          ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.yes')
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MasterPageSection>

          <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.digestIntegrityTitle')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.semanticGaps')}
                value={inspection.integrity.semanticRevisionGapCount}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.duplicateRevisions')}
                value={inspection.integrity.duplicateSemanticRevisionCount}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.uncheckedRows')}
                value={inspection.integrity.digestRowsUnchecked}
              />
              <Metric
                label={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.metric.versionTuple')}
                value={inspection.versionTuple.featureModelVersion}
              />
            </div>
          </MasterPageSection>
        </div>
      ) : null}
    </>
  );
}
