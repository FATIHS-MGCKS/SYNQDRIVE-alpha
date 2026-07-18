import { AlertTriangle } from 'lucide-react';
import { StatusChip } from '../../../../components/patterns';
import { VoiceInlineNotice, VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceControlPlaneOrgWorkspace } from '../../../../lib/api';
import {
  buildProvisioningSteps,
  provisioningProgressPercent,
  provisioningStatusLabel,
  provisioningStatusTone,
  type VoiceProvisioningStepView,
} from './voice-org-provisioning.ops';
import { timeAgo } from './voice-org-workspace.ops';

interface VoiceOrgProvisioningTabProps {
  workspace: VoiceControlPlaneOrgWorkspace;
  onStepAction: (step: VoiceProvisioningStepView) => void;
  onRefreshProvisioning: () => void;
}

export function VoiceOrgProvisioningTab({
  workspace,
  onStepAction,
  onRefreshProvisioning,
}: VoiceOrgProvisioningTabProps) {
  const steps = buildProvisioningSteps(workspace);
  const progress = provisioningProgressPercent(steps);
  const failedSteps = steps.filter(s => s.status === 'failed');

  return (
    <div className="space-y-4" data-testid="voice-org-tab-provisioning">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <VoiceSectionHeader
          title="Provisionierungs-Pipeline"
          description="10 Schritte von Subscription bis Activation — mit Retry, Audit und Idempotenz."
        />
        <button
          type="button"
          onClick={onRefreshProvisioning}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        >
          Provisionierungsstatus aktualisieren
        </button>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold">Fortschritt</span>
          <span className="tabular-nums">{progress} %</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-[color:var(--brand)] transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {failedSteps.length > 0 && (
        <VoiceInlineNotice tone="warning" title={`${failedSteps.length} fehlgeschlagene(r) Schritt(e)`}>
          Prüfen Sie die Fehler unten und nutzen Sie die fachliche Retry-Aktion.
        </VoiceInlineNotice>
      )}

      <ol className="space-y-3" aria-label="Provisionierungsschritte">
        {steps.map(step => (
          <li
            key={step.id}
            className="rounded-xl border border-border p-4 space-y-2"
            data-testid={`provisioning-step-${step.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground">Schritt {step.order}</p>
                <h4 className="text-sm font-semibold">{step.label}</h4>
                <p className="text-[10px] text-muted-foreground">{step.resource}</p>
              </div>
              <StatusChip tone={provisioningStatusTone(step.status)}>
                {provisioningStatusLabel(step.status)}
              </StatusChip>
            </div>

            {step.prerequisites.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Voraussetzung: {step.prerequisites.join(', ')}
              </p>
            )}

            {step.lastChangedAt && (
              <p className="text-[10px] text-muted-foreground">
                Letzte Änderung: {timeAgo(step.lastChangedAt)}
              </p>
            )}

            {step.error && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{step.error}</span>
              </div>
            )}

            {step.actionLabel && (
              <button
                type="button"
                onClick={() => onStepAction(step)}
                className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
              >
                {step.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ol>

      {workspace.provisioningJobs.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold mb-2">Hintergrund-Jobs</h4>
          <ul className="space-y-2 text-xs">
            {workspace.provisioningJobs.map(job => (
              <li key={job.id} className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
                <span>{job.jobType}</span>
                <StatusChip tone={job.status === 'FAILED' ? 'critical' : job.status === 'COMPLETED' ? 'success' : 'warning'}>
                  {job.status}
                </StatusChip>
                <span className="w-full text-[10px] text-muted-foreground font-mono">
                  {job.currentStep ?? '—'}
                  {job.lastError ? ` · ${job.lastError}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
