import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../lib/api';
import type {
  RentalRuleDraftRevisionRef,
  RentalRulePublishImpactAnalysis,
  RentalRuleRevisionFieldChange,
} from './rental-rules.types';
import { RentalRulesMutationError, rentalRulesMutate } from './rental-rules-concurrency.errors';
import { formatRuleValue, labelRuleField, labelRuleSource } from './rental-rules.utils';

export type RentalRulePublishScope = 'defaults' | 'category' | 'vehicle';

interface RentalRulePublishImpactPanelProps {
  orgId: string;
  scope: RentalRulePublishScope;
  scopeEntityId?: string;
  draftRevision: RentalRuleDraftRevisionRef;
  expectedVersion: number;
  canPublish: boolean;
  onPublished: () => Promise<void> | void;
}

function changeKindLabel(kind: RentalRuleRevisionFieldChange['kind']): string {
  if (kind === 'added') return 'Added';
  if (kind === 'removed') return 'Removed';
  return 'Changed';
}

function DiffRow({ change }: { change: RentalRuleRevisionFieldChange }) {
  return (
    <li className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{labelRuleField(change.field)}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {changeKindLabel(change.kind)}
        </span>
      </div>
      <div className="mt-1 grid gap-1 text-muted-foreground sm:grid-cols-2">
        <p>
          <span className="text-foreground/70">Before:</span>{' '}
          {formatRuleValue(change.field, change.previousValue)}
          <span className="ml-1 text-[11px]">({labelRuleSource(change.previousSource, null)})</span>
        </p>
        <p>
          <span className="text-foreground/70">After:</span>{' '}
          {formatRuleValue(change.field, change.newValue)}
          <span className="ml-1 text-[11px]">({labelRuleSource(change.newSource, null)})</span>
        </p>
      </div>
    </li>
  );
}

function ImpactCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-foreground">{count}</p>
    </div>
  );
}

export function RentalRulePublishImpactPanel({
  orgId,
  scope,
  scopeEntityId,
  draftRevision,
  expectedVersion,
  canPublish,
  onPublished,
}: RentalRulePublishImpactPanelProps) {
  const [analysis, setAnalysis] = useState<RentalRulePublishImpactAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [acknowledgeCritical, setAcknowledgeCritical] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAnalysis = useCallback(async () => {
    if (!orgId || !draftRevision?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.rentalRules.analyzePublishImpact(orgId, scope, {
        revisionId: draftRevision.id,
        scopeEntityId,
      });
      setAnalysis(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load publish impact';
      setLoadError(message);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [draftRevision?.id, orgId, scope, scopeEntityId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const handlePublish = async () => {
    if (!draftRevision?.id) return;
    const reason = changeReason.trim();
    if (!reason) {
      toast.error('A change reason is required before publishing');
      return;
    }
    if (analysis?.criticalImpact.requiresAcknowledgement && !acknowledgeCritical) {
      toast.error('Please acknowledge the critical impact before publishing');
      return;
    }

    setPublishing(true);
    try {
      await rentalRulesMutate(
        'POST',
        api.rentalRules.publishPath(orgId, scope, scopeEntityId),
        {
          revisionId: draftRevision.id,
          expectedVersion,
          expectedLockVersion: draftRevision.lockVersion,
          changeReason: reason,
          ...(analysis?.criticalImpact.requiresAcknowledgement
            ? { acknowledgeCriticalImpact: true }
            : {}),
        },
      );
      toast.success('Rental rules published');
      setChangeReason('');
      setAcknowledgeCritical(false);
      await onPublished();
    } catch (e: unknown) {
      if (e instanceof RentalRulesMutationError) {
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : 'Publish failed');
      }
    } finally {
      setPublishing(false);
    }
  };

  const diffRows = analysis
    ? [
        ...analysis.diff.addedRules,
        ...analysis.diff.changedRules,
        ...analysis.diff.removedRules,
      ]
    : [];

  return (
    <section className="mt-6 space-y-4 border-t border-border/70 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Publish draft</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Review the before/after diff and affected bookings before publishing to production.
          </p>
        </div>
        <button
          type="button"
          className="sq-btn sq-btn-ghost min-h-8 shrink-0 text-[12px]"
          onClick={() => void loadAnalysis()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Loading publish impact…
        </div>
      )}

      {loadError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {loadError}
        </p>
      )}

      {analysis && !loading && (
        <>
          {!analysis.diff.hasChanges ? (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
              No rule field changes detected in this draft.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-foreground">Rule changes</p>
              <ul className="space-y-2">
                {diffRows.map((change) => (
                  <DiffRow key={`${change.field}-${change.kind}`} change={change} />
                ))}
              </ul>
            </div>
          )}

          {analysis.diff.scopeMetaChanges.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-foreground">Scope settings</p>
              <ul className="space-y-2">
                {analysis.diff.scopeMetaChanges.map((change) => (
                  <li
                    key={change.key}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">{change.key}</span>:{' '}
                    {String(change.previousValue ?? '—')} → {String(change.newValue ?? '—')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[12px] font-medium text-foreground">Affected scope</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <ImpactCount label="Categories" count={analysis.affectedScopes.categories.length} />
              <ImpactCount label="Vehicles" count={analysis.affectedScopes.vehicles.length} />
              <ImpactCount
                label="Without category"
                count={analysis.affectedScopes.vehiclesWithoutCategory.length}
              />
              <ImpactCount
                label="Vehicle overrides"
                count={analysis.affectedScopes.vehicleOverrides.length}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[12px] font-medium text-foreground">Booking impact (future)</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <ImpactCount label="Wizard drafts" count={analysis.bookingImpact.wizardDraft.count} />
              <ImpactCount label="Pending" count={analysis.bookingImpact.pending.count} />
              <ImpactCount label="Confirmed (unchanged)" count={analysis.bookingImpact.confirmed.count} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Confirmed bookings are never changed automatically by publish.
            </p>
          </div>

          {analysis.manualApprovalImpact.pendingApprovalCount > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
              {analysis.manualApprovalImpact.pendingApprovalCount} pending manual eligibility approval
              {analysis.manualApprovalImpact.pendingApprovalCount === 1 ? '' : 's'} may be affected.
            </p>
          )}

          {analysis.criticalImpact.isCritical && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-[12px] text-amber-950 dark:text-amber-50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">Critical change detected</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-amber-900/90 dark:text-amber-100/90">
                    {analysis.criticalImpact.messages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {analysis.effectiveImpactTotalVehicles > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Effective rule changes on {analysis.effectiveImpactTotalVehicles} vehicle
              {analysis.effectiveImpactTotalVehicles === 1 ? '' : 's'}
              {analysis.effectiveImpactTruncated ? ' (sampled)' : ''}.
            </p>
          )}

          {canPublish && (
            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-foreground">
                  Change reason <span className="text-destructive">*</span>
                </span>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Why are these rules being published?"
                  className="sq-input min-h-[72px] w-full resize-y text-[12px]"
                  disabled={publishing}
                />
              </label>

              {analysis.criticalImpact.requiresAcknowledgement && (
                <label className="flex items-start gap-2 text-[12px] text-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={acknowledgeCritical}
                    onChange={(e) => setAcknowledgeCritical(e.target.checked)}
                    disabled={publishing}
                  />
                  <span>I understand the critical impact and want to proceed.</span>
                </label>
              )}

              <button
                type="button"
                className="sq-btn sq-btn-primary min-h-9"
                disabled={publishing || !changeReason.trim()}
                onClick={() => void handlePublish()}
              >
                {publishing ? 'Publishing…' : 'Publish to production'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
