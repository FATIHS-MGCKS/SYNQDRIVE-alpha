import { useCallback, useEffect, useMemo, useState } from 'react';
import { Battery, RefreshCw, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { MasterEmptyState, MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { MasterPageHeader, MasterPageSection } from '../shell';
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
        {isCanonical && <span className="font-semibold text-foreground">canonical</span>}
        <span>digest {revision.digestValid ? 'valid' : 'MISMATCH'}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric label="Shutdown → first rest Δ" value={formatMillivolts(revision.shutdownToFirstRestDeltaMv)} />
        <Metric label="Theil-Sen slope" value={formatSlope(revision.robustRestSlopeMvPerHour)} />
        <Metric label="Median rest V" value={formatMillivolts(revision.medianRestVoltageMv)} />
        <Metric label="Valid rest points" value={revision.numberOfValidRestPoints} />
        <Metric label="Min rest V" value={formatMillivolts(revision.minimumRestVoltageMv)} />
        <Metric label="Max rest V" value={formatMillivolts(revision.maximumRestVoltageMv)} />
        <Metric label="Variance mV²" value={revision.restVoltageVarianceMv2} />
        <Metric label="Missing rungs" value={revision.missingRungCount} />
        <Metric label="Charge class" value={revision.chargeOpportunityClass} />
        <Metric label="Observation span" value={revision.observationSpanMs != null ? `${revision.observationSpanMs} ms` : '—'} />
      </div>
      {retentionPoints.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Retention curve points (from C5A inputSummary): {retentionPoints.length} eligible retention point(s) — values not recomputed in UI.
        </p>
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

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const res = await api.admin.vehicles.listAll({ limit: 300 });
      setVehicles(res.data ?? []);
    } catch {
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

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
      setErrorMessage('Rest sessions could not be loaded.');
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
      setErrorMessage(e instanceof Error ? e.message : 'Inspection request failed.');
    }
  }, [organizationId, vehicleId, restSessionId]);

  useEffect(() => {
    void runInspection();
  }, [runInspection]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  return (
    <>
      <MasterPageHeader
        title="Battery V2 shadow inspection"
        description="Read-only Master Admin view over M3_3C_C5A_V1 — internal engineering inspection, not customer health UI (M3.3H)."
        icon={<Battery className="w-6 h-6 text-status-info" />}
        actions={
          <Button type="button" variant="ghost" size="icon" onClick={() => void runInspection()} aria-label="Refresh inspection">
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      <MasterPageSection title="Target selection">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">Organization</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={organizationId}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setVehicleId('');
              }}
            >
              <option value="">Select organization…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.companyName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 md:col-span-2">
            <span className="text-muted-foreground">Vehicle</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm mb-2"
                placeholder="Filter plate / VIN / make…"
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
              <option value="">Select vehicle…</option>
              {filteredVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {[v.licensePlate, v.make, v.model].filter(Boolean).join(' · ') || v.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 md:col-span-3">
            <span className="text-muted-foreground">Rest session</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={restSessionId}
              disabled={!vehicleId || sessionsLoading}
              onChange={(e) => setRestSessionId(e.target.value)}
            >
              <option value="">Select rest session…</option>
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
          title="No vehicle selected"
          description="Choose an organization and vehicle to load Battery V2 rest-session inspection data."
        />
      ) : !restSessionId ? (
        <MasterEmptyState
          title="No rest session selected"
          description={sessions.length === 0 ? 'No rest sessions found for this vehicle.' : 'Select a rest session to inspect.'}
        />
      ) : phase === 'loading' ? (
        <MasterLoadingState variant="card" count={3} />
      ) : phase === 'error' ? (
        <MasterErrorState title="Inspection failed" description={errorMessage ?? 'Unknown error'} onRetry={() => void runInspection()} />
      ) : inspection ? (
        <div className="space-y-4">
          <div className={`rounded-xl border px-4 py-3 ${integrityClass(inspection.integrity.overallStatus)}`}>
            <p className="text-sm font-semibold">Integrity: {integrityLabel(inspection.integrity.overallStatus)}</p>
            <p className="text-xs mt-1 opacity-90">
              Contract {inspection.inspectionContractVersion} · digest scope {inspection.integrity.digestVerificationScope} · checked{' '}
              {inspection.integrity.digestRowsChecked}/{inspection.featureSummary.totalRows} rows · mismatches{' '}
              {inspection.integrity.digestMismatchCount}
            </p>
          </div>

          <MasterPageSection title="Session identity">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Metric label="Vehicle" value={selectedVehicle?.licensePlate ?? inspection.session.vehicleId} />
              <Metric label="Session status" value={inspection.session.sessionStatus} />
              <Metric label="Anchor" value={`${inspection.session.anchorType} @ ${new Date(inspection.session.anchorAt).toLocaleString()}`} />
              <Metric label="End reason" value={inspection.session.endReason ?? '—'} />
              <Metric label="Rest observations" value={`${inspection.session.validRestObservationCount}/${inspection.session.restObservationCount}`} />
              <Metric label="Session id" value={inspection.session.id} />
            </div>
          </MasterPageSection>

          <MasterPageSection title="Canonical state">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Canonical revision" value={inspection.featureSummary.canonicalSemanticRevision} />
              <Metric label="Canonical row id" value={inspection.featureSummary.canonicalFeatureRowId?.slice(0, 12) ?? '—'} />
              <Metric label="Selection" value={inspection.integrity.canonicalSelectionStatus} />
              <Metric label="Latest semantic rev" value={inspection.featureSummary.latestSemanticRevision} />
              <Metric label="Total feature rows" value={inspection.featureSummary.totalRows} />
              <Metric label="Window truncated" value={inspection.featureSummary.revisionsTruncated ? 'yes (latest 100)' : 'no'} />
              <Metric label="Count/aggregate consistent" value={inspection.integrity.countAggregateConsistent ? 'yes' : 'NO'} />
            </div>
          </MasterPageSection>

          <RevisionFeatures title="Canonical feature (C5A)" revision={inspection.canonicalFeature} isCanonical />

          {inspection.canonicalFeature?.chargeOpportunityRaw != null && (
            <MasterPageSection title="Charge context (canonical, C5A raw)">
              <pre className="text-xs overflow-auto max-h-48 rounded-lg border border-border p-3 bg-muted/30">
                {JSON.stringify(inspection.canonicalFeature.chargeOpportunityRaw, null, 2)}
              </pre>
            </MasterPageSection>
          )}

          <MasterPageSection title={`Revision history (visible window: ${inspection.revisions.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2">Rev</th>
                    <th className="py-2 pr-2">Phase</th>
                    <th className="py-2 pr-2">Trust</th>
                    <th className="py-2 pr-2">Digest</th>
                    <th className="py-2 pr-2">Slope</th>
                    <th className="py-2 pr-2">Canonical</th>
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
                      <td className="py-1.5 pr-2">{row.id === inspection.featureSummary.canonicalFeatureRowId ? 'yes' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MasterPageSection>

          <MasterPageSection title="Digest / revision integrity">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Semantic gaps" value={inspection.integrity.semanticRevisionGapCount} />
              <Metric label="Duplicate revisions" value={inspection.integrity.duplicateSemanticRevisionCount} />
              <Metric label="Unchecked rows" value={inspection.integrity.digestRowsUnchecked} />
              <Metric label="Version tuple" value={inspection.versionTuple.featureModelVersion} />
            </div>
          </MasterPageSection>
        </div>
      ) : null}
    </>
  );
}
